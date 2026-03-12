import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { updateOperatingPolicyLogic } from "./policy_engine.js";

// Import MCP directly to call other tools safely across server boundaries
import { MCP } from "../../../mcp.js";

export async function executeStrategicInitiativeLogic(mcp: MCP, strategic_decision: string, company?: string) {
    const memory = new EpisodicMemory();
    await memory.init();

    await mcp.init();

    let decisionData;
    try {
        decisionData = JSON.parse(strategic_decision);
    } catch (e) {
        throw new Error("Invalid strategic_decision JSON.");
    }

    // 1. Ask LLM to translate decision into specific execution parameters
    const llm = createLLM();
    const prompt = `You are the Chief Operating Officer (COO). A strategic decision has been made by the CEO based on recent forecasting data.

STRATEGIC DECISION:
${JSON.stringify(decisionData, null, 2)}

TASK:
Translate this strategic decision into specific execution parameters.
Specifically, what parameters in our operating policy should be adjusted to reflect this decision?

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
    "policy_updates": {
        "key_name": "new_value", // e.g., "max_fleet_size": 10, "base_pricing_multiplier": 1.15
        "another_key": 123
    },
    "justification": "Why these specific policy parameters are being changed."
}`;

    const llmResponse = await llm.generate(prompt, []);
    let parsedResponse;
    try {
        let jsonStr = llmResponse.message || llmResponse.thought || "";
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        }
        parsedResponse = JSON.parse(jsonStr);
    } catch (e) {
        throw new Error(`Failed to parse LLM response: ${(e as Error).message}`);
    }

    if (!parsedResponse.policy_updates) {
         throw new Error("LLM response missing 'policy_updates'.");
    }

    const executionResults: any = {
        policy_updates: parsedResponse.policy_updates,
        justification: parsedResponse.justification,
        policy_update_result: null,
        initiatives_result: null
    };

    // 2. Update Operating Policy
    try {
        const policyResult = await updateOperatingPolicyLogic(
            parsedResponse.policy_updates,
            parsedResponse.justification,
            mcp,
            company
        );
        executionResults.policy_update_result = policyResult;
    } catch (e: any) {
        console.error("Failed to update operating policy:", e);
        executionResults.policy_update_error = e.message;
    }

    // 3. Generate Strategic Initiatives (which creates Linear issues) via Brain MCP
    try {
        const tools = await mcp.getTools();
        const generateTool = tools.find(t => t.name === "generate_strategic_initiatives");
        if (!generateTool) {
            throw new Error("generate_strategic_initiatives tool not found in MCP registry.");
        }

        const result = await generateTool.execute({ company });

        let initiativesResult;
        if (result && (result as any).content && (result as any).content.length > 0) {
            const contentText = (result as any).content[0].text;
            try {
                initiativesResult = JSON.parse(contentText);
            } catch {
                initiativesResult = contentText;
            }
        } else {
            initiativesResult = result;
        }

        executionResults.initiatives_result = initiativesResult;
    } catch (e: any) {
        console.error("Failed to generate strategic initiatives via MCP:", e);
        executionResults.initiatives_error = e.message;
    }

    // 4. Store Execution Log in Brain
    await memory.store(
        `executive_action_${Date.now()}`,
        `Executing Strategic Decision: ${strategic_decision.substring(0, 100)}...`,
        JSON.stringify(executionResults),
        ["executive_action", "strategic_decision", "phase_30"],
        company,
        undefined, false, undefined, undefined, 0, 0,
        "autonomous_decision_execution"
    );

    return executionResults;
}

export function registerExecutiveActionTools(server: McpServer, mcpClient?: MCP) {
    const mcp = mcpClient || new MCP();

    server.tool(
        "execute_strategic_initiative",
        "Takes a strategic decision and converts it into actionable policy updates and Linear issues.",
        {
            strategic_decision: z.string().describe("JSON string of the strategic decision output from make_strategic_decision."),
            company: z.string().optional().describe("Company context namespace.")
        },
        async ({ strategic_decision, company }) => {
            try {
                const results = await executeStrategicInitiativeLogic(mcp, strategic_decision, company);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(results, null, 2)
                    }]
                };
            } catch (e) {
                return {
                    content: [{
                        type: "text",
                        text: `Error executing strategic initiative: ${(e as Error).message}`
                    }],
                    isError: true
                };
            }
        }
    );
}