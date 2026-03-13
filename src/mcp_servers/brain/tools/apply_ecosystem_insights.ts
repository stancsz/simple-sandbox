import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { LLM, createLLM } from "../../../llm.js";
import { analyzeEcosystemPatterns } from "./pattern_analysis.js";
import { updateOperatingPolicyLogic } from "../../business_ops/tools/policy_engine.js";
import { MCP } from "../../../mcp.js";

/**
 * Applies ecosystem insights to update the swarm fleet operating policy.
 * @param episodic The Brain's EpisodicMemory instance.
 * @param llm The LLM instance to use.
 * @param company The company context namespace.
 */
export async function applyEcosystemInsights(
    episodic: EpisodicMemory,
    llm: LLM,
    company: string = "default"
): Promise<any> {
    try {
        // 1. Get the latest ecosystem insights
        const insights = await analyzeEcosystemPatterns(episodic, llm);

        if (!insights || insights.themes?.length === 0) {
            return { status: "no_insights", message: "No actionable insights found in ecosystem patterns." };
        }

        // 2. Translate insights into parameter updates using LLM
        const prompt = `
You are the Autonomous Ecosystem Optimizer for the root AI agency.
Your task is to review the latest Ecosystem Pattern Analysis and automatically translate these meta-learning patterns into actionable parameter adjustments for the Swarm Fleet.

ECOSYSTEM ANALYSIS REPORT:
${JSON.stringify(insights, null, 2)}

Identify specific, actionable parameter updates for the global operating policy.
Common parameters include:
- max_agents_per_swarm (integer)
- min_margin (float, e.g., 0.2)
- risk_tolerance ("low", "medium", "high")

You can also invent new custom parameters if the insights strongly suggest a need for them (e.g., "enforce_caching": true, "max_tokens_per_task": 5000).

Return a structured JSON object with EXACTLY these keys:
{
  "parameter_updates": { "key": "value" },
  "justification": "A clear, actionable explanation linking the updates directly to the ecosystem analysis."
}
        `;

        const response = await llm.generate(prompt, []);

        let updateData: any;
        try {
            let jsonStr = response.message || response.thought || "";
            jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
            const firstBrace = jsonStr.indexOf("{");
            const lastBrace = jsonStr.lastIndexOf("}");
            if (firstBrace !== -1 && lastBrace !== -1) {
                jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
            }
            updateData = JSON.parse(jsonStr);
        } catch (e: any) {
            throw new Error(`Failed to parse LLM response for parameter updates: ${e.message}. Raw response: ${response.message}`);
        }

        if (!updateData.parameter_updates || Object.keys(updateData.parameter_updates).length === 0) {
             return { status: "no_updates", message: "No parameter updates generated from insights.", insights };
        }

        // 3. Apply the updates to the global policy
        // We pass a dummy MCP instance since updateOperatingPolicyLogic doesn't actually use it currently,
        // but it requires it in its signature.
        const dummyMcp = {} as MCP;
        const policyResult = await updateOperatingPolicyLogic(
            updateData.parameter_updates,
            updateData.justification,
            dummyMcp,
            company,
            episodic
        );

        // 4. Log the optimization action to Episodic Memory
        await episodic.store(
            `ecosystem_optimization_${Date.now()}`,
            `Translate ecosystem insights into policy updates: ${updateData.justification}`,
            JSON.stringify(updateData),
            [],
            company,
            undefined,
            undefined,
            undefined,
            undefined,
            0,
            0,
            "ecosystem_optimization"
        );

        return {
            status: "success",
            updates_applied: updateData.parameter_updates,
            justification: updateData.justification,
            policy_version: policyResult.version,
            insights: insights
        };

    } catch (e: any) {
        throw new Error(`Failed to apply ecosystem insights: ${e.message}`);
    }
}

/**
 * Registers the apply_ecosystem_insights tool with the Brain MCP server.
 */
export function registerApplyEcosystemInsightsTool(server: McpServer, episodic: EpisodicMemory) {
    server.tool(
        "apply_ecosystem_insights",
        "Automatically translates meta-learning patterns into actionable swarm parameter adjustments and updates the global operating policy.",
        {
            company: z.string().optional().describe("Company context namespace.")
        },
        async ({ company }) => {
            try {
                const llm = createLLM();
                const result = await applyEcosystemInsights(episodic, llm, company);
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
                };
            } catch (e: any) {
                return {
                    content: [{ type: "text", text: `Error applying ecosystem insights: ${e.message}` }],
                    isError: true
                };
            }
        }
    );
}
