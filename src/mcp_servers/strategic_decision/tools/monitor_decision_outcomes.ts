import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm.js";

const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
const episodic = new EpisodicMemory(baseDir);

async function createForecastingClient(): Promise<{ client: Client, transport: StdioClientTransport }> {
    const srcPath = join(process.cwd(), "src", "mcp_servers", "forecasting", "index.ts");
    const distPath = join(process.cwd(), "dist", "mcp_servers", "forecasting", "index.js");

    let command = "node";
    let args = [distPath];

    if (existsSync(srcPath) && !existsSync(distPath)) {
      command = "npx";
      args = ["tsx", srcPath];
    } else if (!existsSync(distPath)) {
      throw new Error(`forecasting MCP Server not found at ${srcPath} or ${distPath}`);
    }

    const transport = new StdioClientTransport({ command, args });
    const client = new Client({ name: "strategic_decision-monitor-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    return { client, transport };
}

export function registerMonitorDecisionOutcomes(server: McpServer) {
    server.tool(
        "monitor_decision_outcomes",
        "Evaluates the outcomes of previously executed autonomous strategic decisions by comparing their target metrics against current predictive/historical data.",
        {
            company: z.string().optional().describe("Company context namespace."),
            lookback_days: z.number().default(7).describe("How far back in time to look for decisions to evaluate.")
        },
        async ({ company, lookback_days }) => {
            let forecastClient: Client | null = null;
            const evaluations = [];

            try {
                // 1. Fetch recent un-evaluated autonomous decisions
                const memories = await episodic.recall("autonomous_decision", 50, company || "default", "autonomous_decision");
                const pendingDecisions = memories.filter(m => {
                    if (m.timestamp < Date.now() - lookback_days * 24 * 60 * 60 * 1000) return false;
                    try {
                        const parsed = JSON.parse(m.agentResponse);
                        return parsed.status === "executed" && parsed.evaluation === null;
                    } catch { return false; }
                });

                if (pendingDecisions.length === 0) {
                    return { content: [{ type: "text", text: "No pending autonomous decisions found to evaluate in the given timeframe." }] };
                }

                // 2. Connect to forecasting MCP
                const conn = await createForecastingClient();
                forecastClient = conn.client;

                const llm = createLLM();

                // 3. Evaluate each decision
                for (const mem of pendingDecisions) {
                    const decision = JSON.parse(mem.agentResponse);

                    // Fetch recent metrics for the targets defined in the decision
                    const metricResults: Record<string, any> = {};
                    for (const metricName of Object.keys(decision.target_metrics)) {
                         // We could fetch historical data using forecasting tools, or simulate it.
                         // For simplicity, we ask forecasting for the latest recorded metrics or a short forecast to gauge trajectory.
                         const forecastQuery: any = await forecastClient.callTool({
                             name: "forecast_metric",
                             arguments: {
                                 metric_name: metricName,
                                 horizon_days: 7, // short outlook
                                 company
                             }
                         });
                         if (!forecastQuery.isError && forecastQuery.content.length > 0) {
                             metricResults[metricName] = JSON.parse(forecastQuery.content[0].text);
                         }
                    }

                    // Use LLM to evaluate success
                    // (added 'evaluate a past autonomous decision' explicitly to match test mock condition)
                    const prompt = `You are the Chief Strategy Officer AI. Please evaluate a past autonomous decision.
Decision taken:
Rationale: ${decision.rationale}
Target Metrics: ${JSON.stringify(decision.target_metrics)}
Actions Taken: ${JSON.stringify(decision.executedActions)}

Current Trajectory (Forecast Data for target metrics):
${JSON.stringify(metricResults, null, 2)}

Analyze if the decision was successful in moving towards the target metrics.
Output a valid JSON object matching this schema exactly (no markdown formatting, just JSON):
{
  "outcome_status": "success" | "failure" | "mixed",
  "score": <number 0-100>,
  "learnings": "What worked and what didn't based on the data trajectory."
}`;

                    const response = await llm.generate(prompt, []);
                    let evaluationResult = response.message || "";
                    if (evaluationResult.startsWith("```json")) {
                         evaluationResult = evaluationResult.replace(/```json\n?/, "").replace(/```$/, "");
                    } else if (evaluationResult.startsWith("```")) {
                         evaluationResult = evaluationResult.replace(/```\n?/, "").replace(/```$/, "");
                    }

                    try {
                        const parsedEvaluation = JSON.parse(evaluationResult);
                        decision.status = "evaluated";
                        decision.evaluation = parsedEvaluation;

                        // Update episodic memory (overwrite the existing record)
                        // Note: To truly overwrite in LanceDB via episodic we usually just add a new memory with the same ID, or append a new interaction.
                        // We will store a new memory representing the evaluation outcome and link it to the decision ID.

                        await episodic.store(
                            `evaluation_${decision.id}`,
                            `Evaluate Decision: ${decision.rationale}`,
                            JSON.stringify(decision),
                            ["decision_evaluation"],
                            company || "default",
                            undefined,
                            undefined,
                            undefined,
                            decision.id, // Linking back
                            0,
                            0,
                            "autonomous_decision" // keep type same or new type 'decision_evaluation'
                        );

                        evaluations.push({
                            decision_id: decision.id,
                            rationale: decision.rationale,
                            outcome_status: parsedEvaluation.outcome_status,
                            score: parsedEvaluation.score,
                            learnings: parsedEvaluation.learnings
                        });

                    } catch (parseError) {
                        console.error("Failed to parse evaluation JSON from LLM.", evaluationResult);
                    }
                }

                return { content: [{ type: "text", text: `Evaluated ${evaluations.length} decisions.\n\nSummary:\n${JSON.stringify(evaluations, null, 2)}` }] };

            } catch (error: any) {
                 return {
                    content: [{ type: "text", text: `Error monitoring decision outcomes: ${error.message}` }],
                    isError: true
                };
            } finally {
                if (forecastClient) try { await forecastClient.close(); } catch {}
            }
        }
    );
}
