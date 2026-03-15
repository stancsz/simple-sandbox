import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
    evaluateMassiveDemand,
    optimizeGlobalCosts,
    enforceResourceBudget,
    simulateScalingScenario
} from "./scaling_core.js";
import { EpisodicMemory } from "../../brain/episodic.js";
import { dirname } from "path";

const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
const episodic = new EpisodicMemory(baseDir);

export function registerHyperScalingTools(server: McpServer) {
    server.tool(
        "evaluate_massive_demand",
        "Evaluates required swarm capacity for a large number of concurrent clients by fetching data from Linear, Brain, and Health Monitor.",
        {},
        async () => {
            try {
                const result = await evaluateMassiveDemand(episodic);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error evaluating massive demand: ${error.message}` }]
                };
            }
        }
    );

    server.tool(
        "optimize_global_costs",
        "Calculates cost optimization strategies and model routing for a given swarm scale by fetching financial data from Business Ops.",
        {
            projectedSwarms: z.number().describe("Projected number of active swarms."),
        },
        async ({ projectedSwarms }) => {
            try {
                const result = await optimizeGlobalCosts(projectedSwarms);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error optimizing global costs: ${error.message}` }]
                };
            }
        }
    );

    server.tool(
        "enforce_resource_budget",
        "Enforces policy-driven limits on ecosystem-wide resource allocation.",
        {
            requestedSwarms: z.number().describe("The number of swarms requested by the demand evaluator."),
            companyId: z.string().optional().describe("Company ID for policy retrieval (defaults to 'default')."),
        },
        async ({ requestedSwarms, companyId }) => {
            try {
                const result = await enforceResourceBudget(requestedSwarms, companyId);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error enforcing resource budget: ${error.message}` }]
                };
            }
        }
    );

    server.tool(
        "simulate_scaling_scenario",
        "Projects ecosystem cost and performance for an arbitrary number of clients.",
        {
            targetClients: z.number().describe("The target number of concurrent clients to simulate."),
            tasksPerClient: z.number().describe("The assumed average tasks per client."),
        },
        async ({ targetClients, tasksPerClient }) => {
            try {
                const result = await simulateScalingScenario(targetClients, tasksPerClient);
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            } catch (error: any) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error simulating scaling scenario: ${error.message}` }]
                };
            }
        }
    );
}
