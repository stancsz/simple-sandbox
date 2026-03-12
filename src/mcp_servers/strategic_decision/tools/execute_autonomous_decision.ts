import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { randomUUID } from "crypto";

const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
const episodic = new EpisodicMemory(baseDir);

async function createClient(serverName: "business_ops", clientName: string): Promise<{ client: Client, transport: StdioClientTransport }> {
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

export function registerExecuteAutonomousDecision(server: McpServer) {
    server.tool(
        "execute_autonomous_decision",
        "Executes a recommended strategic pivot by updating operating policies and triggering swarm balancing.",
        {
            company: z.string().optional().describe("Company context namespace."),
            recommended_actions: z.array(z.string()).describe("List of strategic actions to take."),
            target_metrics: z.record(z.string()).describe("Target metrics aiming to achieve."),
            policy_updates: z.object({
                min_margin: z.number().optional(),
                risk_tolerance: z.enum(["low", "medium", "high"]).optional(),
                max_agents_per_swarm: z.number().optional()
            }).describe("Operating policy adjustments."),
            rationale: z.string().describe("Explanation for the decision.")
        },
        async ({ company, recommended_actions, target_metrics, policy_updates, rationale }) => {
            let businessOpsClient: Client | null = null;
            const executedActions = [];

            if (recommended_actions.length === 0 && Object.keys(policy_updates).length === 0) {
                 return { content: [{ type: "text", text: "No actions or policy updates to execute." }] };
            }

            try {
                const bOpsConn = await createClient("business_ops", "strategic_decision-bops-client");
                businessOpsClient = bOpsConn.client;

                // 1. Update Operating Policy if needed
                if (policy_updates && Object.keys(policy_updates).length > 0) {
                    // We need to pass required fields. We'll set some defaults if they aren't provided.
                    const updateArgs: any = {
                        name: "Autonomous Policy Pivot",
                        description: rationale,
                        company: company || "default"
                    };
                    if (policy_updates.min_margin !== undefined) updateArgs.min_margin = policy_updates.min_margin;
                    if (policy_updates.risk_tolerance !== undefined) updateArgs.risk_tolerance = policy_updates.risk_tolerance;
                    if (policy_updates.max_agents_per_swarm !== undefined) updateArgs.max_agents_per_swarm = policy_updates.max_agents_per_swarm;

                    const policyResult: any = await businessOpsClient.callTool({
                        name: "update_operating_policy",
                        arguments: updateArgs
                    });

                    if (policyResult.isError) {
                        return { content: [{ type: "text", text: `Failed to update operating policy: ${JSON.stringify(policyResult.content)}` }], isError: true };
                    }
                    executedActions.push(`Updated Operating Policy: ${JSON.stringify(policy_updates)}`);
                }

                // 2. Trigger Swarm Fleet Balancing
                // If the recommendation explicitly mentions scaling or resource shifts, we trigger balancing.
                // We'll just trigger it if there are any recommended actions to ensure fleet is aligned.
                if (recommended_actions.length > 0) {
                     const balanceResult: any = await businessOpsClient.callTool({
                         name: "balance_fleet_resources",
                         arguments: { company: company || "default" }
                     });

                     if (balanceResult.isError) {
                          executedActions.push(`Attempted Fleet Balancing but failed: ${JSON.stringify(balanceResult.content)}`);
                     } else {
                          executedActions.push("Triggered Fleet Balancing.");
                     }
                }

                // 3. Record decision in Episodic Memory
                const decisionId = randomUUID();
                const decisionRecord = {
                    id: decisionId,
                    timestamp: Date.now(),
                    company: company || "default",
                    recommended_actions,
                    target_metrics,
                    policy_updates,
                    rationale,
                    executedActions,
                    status: "executed",
                    evaluation: null // To be filled by monitor_decision_outcomes
                };

                await episodic.store(
                    `autonomous_decision_${decisionId}`,
                    `Execute Autonomous Decision: ${rationale}`,
                    JSON.stringify(decisionRecord),
                    ["autonomous_decision", "strategic_pivot"],
                    company || "default",
                    undefined,
                    undefined,
                    undefined,
                    decisionId,
                    0,
                    0,
                    "autonomous_decision"
                );

                return { content: [{ type: "text", text: `Successfully executed autonomous decision.\nActions taken: ${executedActions.join("; ")}\nRecorded in memory with ID: ${decisionId}` }] };

            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error executing autonomous decision: ${error.message}` }],
                    isError: true
                };
            } finally {
                if (businessOpsClient) try { await businessOpsClient.close(); } catch {}
            }
        }
    );
}
