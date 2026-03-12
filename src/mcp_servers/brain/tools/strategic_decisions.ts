import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { readStrategy, proposeStrategicPivot } from "./strategy.js";

export async function makeStrategicDecisionLogic(
    episodic: EpisodicMemory,
    forecast_data: string,
    company?: string
) {
    let forecast;
    try {
        forecast = JSON.parse(forecast_data);
    } catch (e) {
        throw new Error("Invalid forecast_data JSON.");
    }

    const currentStrategy = await readStrategy(episodic, company);
    if (!currentStrategy) {
        throw new Error("No active Corporate Strategy found. Cannot make a strategic decision without a baseline.");
    }

    const llm = createLLM();
    const prompt = `You are the Chief Executive Officer (CEO) making high-level strategic decisions based on forecasting data.

CURRENT CORPORATE STRATEGY:
${JSON.stringify(currentStrategy, null, 2)}

FORECAST DATA:
${JSON.stringify(forecast, null, 2)}

TASK:
Analyze the forecast data against our current corporate strategy.
What strategic pivot, if any, is required to optimize for these forecasts?
Consider market conditions, expected growth, and potential risks.

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
    "decision": "A clear, concise statement of the strategic decision (e.g., 'Increase pricing by 15% due to predicted high demand').",
    "rationale": "Detailed explanation of why this decision is optimal given the forecast and current strategy.",
    "confidence_score": 0.85, // 0.0 to 1.0 float representing your confidence in this decision
    "proposed_pivot": "The text proposal for the strategic pivot, to be applied if confidence is high enough."
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

    if (!parsedResponse.decision || typeof parsedResponse.confidence_score !== "number") {
         throw new Error("LLM response missing required fields ('decision', 'confidence_score').");
    }

    let pivotResult = null;
    const CONFIDENCE_THRESHOLD = 0.8;

    if (parsedResponse.confidence_score >= CONFIDENCE_THRESHOLD && parsedResponse.proposed_pivot) {
        try {
            // Automatically propose the strategic pivot
            pivotResult = await proposeStrategicPivot(episodic, llm, parsedResponse.proposed_pivot, company);
        } catch (e: any) {
            console.error("Failed to automatically apply strategic pivot:", e);
        }
    }

    // Store the decision in episodic memory for audit trails
    await episodic.store(
        `strategic_decision_${Date.now()}`,
        `Forecast Analysis Request: ${forecast_data.substring(0, 100)}...`,
        JSON.stringify(parsedResponse),
        ["strategic_decision", "phase_30"],
        company,
        undefined, false, undefined, undefined, 0, 0,
        "autonomous_decision"
    );

    return {
        analysis: parsedResponse,
        pivot_applied: pivotResult !== null,
        updated_strategy: pivotResult
    };
}

export function registerStrategicDecisionTools(server: McpServer, episodic: EpisodicMemory) {
    server.tool(
        "make_strategic_decision",
        "Takes forecast data and the current Corporate Strategy to recommend and potentially execute a strategic pivot.",
        {
            forecast_data: z.string().describe("JSON string of forecast data from the forecasting MCP."),
            company: z.string().optional().describe("Company context namespace.")
        },
        async ({ forecast_data, company }) => {
            try {
                const results = await makeStrategicDecisionLogic(episodic, forecast_data, company);
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
                        text: `Error making strategic decision: ${(e as Error).message}`
                    }],
                    isError: true
                };
            }
        }
    );
}