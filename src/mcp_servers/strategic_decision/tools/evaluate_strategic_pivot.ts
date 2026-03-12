import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";
import { existsSync } from "fs";
import { createLLM } from "../../../llm.js";

// Helper to create MCP client connections
async function createClient(serverName: "brain" | "forecasting", clientName: string): Promise<{ client: Client, transport: StdioClientTransport }> {
    const srcPath = join(process.cwd(), "src", "mcp_servers", serverName, "index.ts");
    const distPath = join(process.cwd(), "dist", "mcp_servers", serverName, "index.js");

    let command = "node";
    let args = [distPath];

    if (existsSync(srcPath) && !existsSync(distPath)) {
      command = "npx";
      args = ["tsx", srcPath];
    } else if (!existsSync(distPath)) {
      throw new Error(`${serverName} MCP Server not found at ${srcPath} or ${distPath}`);
    }

    const transport = new StdioClientTransport({ command, args });
    const client = new Client({ name: clientName, version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    return { client, transport };
}

export function registerEvaluateStrategicPivot(server: McpServer) {
    server.tool(
        "evaluate_strategic_pivot",
        "Evaluates predictive forecasts against current Corporate Strategy to recommend a strategic pivot (e.g., changes to margins, risk tolerance, or resources).",
        {
            company: z.string().optional().describe("Company context namespace."),
            metric_name: z.string().default("revenue").describe("Primary metric to evaluate the forecast against."),
            horizon_days: z.number().default(30).describe("Forecast horizon in days to consider.")
        },
        async ({ company, metric_name, horizon_days }) => {
            let brainClient: Client | null = null;
            let forecastClient: Client | null = null;

            try {
                // 1. Connect to Brain MCP to read strategy
                const brainConn = await createClient("brain", "strategic_decision-brain-client");
                brainClient = brainConn.client;

                const strategyQuery: any = await brainClient.callTool({
                    name: "read_strategy",
                    arguments: { company }
                });

                let currentStrategy = {};
                if (!strategyQuery.isError && strategyQuery.content && strategyQuery.content.length > 0) {
                    try {
                        currentStrategy = JSON.parse(strategyQuery.content[0].text);
                    } catch(e) {}
                }

                // 2. Connect to Forecasting MCP to get forecast
                const forecastConn = await createClient("forecasting", "strategic_decision-forecasting-client");
                forecastClient = forecastConn.client;

                const forecastQuery: any = await forecastClient.callTool({
                    name: "forecast_metric",
                    arguments: {
                        metric_name,
                        horizon_days,
                        company
                    }
                });

                let forecastData = {};
                if (!forecastQuery.isError && forecastQuery.content && forecastQuery.content.length > 0) {
                     try {
                          forecastData = JSON.parse(forecastQuery.content[0].text);
                     } catch(e) {}
                } else if (forecastQuery.isError) {
                    return { content: [{ type: "text", text: `Failed to fetch forecast: ${forecastQuery.content[0]?.text}` }], isError: true };
                }

                // 3. Use LLM to generate pivot recommendation
                const llm = createLLM();
                const prompt = `You are the Chief Strategy Officer AI.
Your task is to analyze the predictive forecast data against the current Corporate Strategy and determine if an autonomous strategic pivot is required.

Current Corporate Strategy:
${JSON.stringify(currentStrategy, null, 2)}

Predictive Forecast for '${metric_name}' (Next ${horizon_days} days):
${JSON.stringify(forecastData, null, 2)}

Analyze the alignment. If the forecast indicates missed targets, excessive resource burn, or an opportunity for rapid growth, recommend a strategic pivot.
Output a valid JSON object matching this schema exactly (no markdown formatting, just JSON):
{
  "recommended_actions": ["List of strategic actions to take"],
  "target_metrics": { "metric_name": "target_value" },
  "policy_updates": {
    "min_margin": <number between 0.0 and 1.0, optional>,
    "risk_tolerance": <"low" | "medium" | "high", optional>,
    "max_agents_per_swarm": <number, optional>
  },
  "rationale": "Explanation for the pivot"
}

If no pivot is needed, return an empty "recommended_actions" array, empty "policy_updates", and state why in "rationale".`;

                const response = await llm.generate(prompt, []);
                let pivotRecommendation = response.message || "";

                // Strip markdown block if present
                if (pivotRecommendation.startsWith("```json")) {
                    pivotRecommendation = pivotRecommendation.replace(/```json\n?/, "").replace(/```$/, "");
                } else if (pivotRecommendation.startsWith("```")) {
                    pivotRecommendation = pivotRecommendation.replace(/```\n?/, "").replace(/```$/, "");
                }

                try {
                    const parsedPivot = JSON.parse(pivotRecommendation);
                    return { content: [{ type: "text", text: JSON.stringify(parsedPivot, null, 2) }] };
                } catch (parseError) {
                     return { content: [{ type: "text", text: `Failed to parse LLM response as JSON. Response was:\n${pivotRecommendation}` }], isError: true };
                }

            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error evaluating strategic pivot: ${error.message}` }],
                    isError: true
                };
            } finally {
                if (brainClient) try { await brainClient.close(); } catch {}
                if (forecastClient) try { await forecastClient.close(); } catch {}
            }
        }
    );
}
