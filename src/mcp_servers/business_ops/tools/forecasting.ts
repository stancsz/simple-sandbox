import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as ss from "simple-statistics";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { getDb, forecast_metric } from "../../forecasting/models.js";
import { createLLM } from "../../../llm.js";
import { readStrategy } from "../../brain/tools/strategy.js";

interface DemandForecastResponse {
    metric_name: string;
    company: string;
    forecast_values: Array<{
        date: string;
        predicted_value: number;
        lower_bound: number;
        upper_bound: number;
    }>;
    trend: 'increasing' | 'decreasing' | 'stable';
    recommendations: string[];
    policy_implications: string[];
}

export function registerDemandForecastingTools(server: McpServer) {
    server.tool(
        "forecast_demand",
        "Forecasts resource demand and token budgets based on historical metrics using simple-statistics, aligning with Corporate Strategy.",
        {
            metric_name: z.string().describe("The name of the metric to forecast (e.g., 'llm_token_usage', 'api_calls', 'revenue')."),
            forecast_horizon: z.string().describe("Forecast horizon string (e.g., '30d')."),
            confidence_level: z.number().optional().describe("Confidence level for the forecast (default: 0.95)."),
            company: z.string().optional().describe("Company identifier context (default: '@simple-cli/showcase').")
        },
        async ({ metric_name, forecast_horizon, confidence_level, company }) => {
            try {
                const targetCompany = company || "@simple-cli/showcase";
                const daysMatch = forecast_horizon.match(/^(\d+)d$/);
                const horizonDays = daysMatch ? parseInt(daysMatch[1], 10) : 30;

                const cacheKey = `demand_forecast_${metric_name}_${horizonDays}d_${targetCompany}`;
                const memory = new EpisodicMemory();

                // Idempotency: Check cache for valid forecast (24 hours)
                const recentForecasts = await memory.search(cacheKey, 10); // fetch multiple to find exact match
                if (recentForecasts.length > 0) {
                    const exactMatch = recentForecasts.find(r => r.query === cacheKey);
                    if (exactMatch) {
                        try {
                            const cachedResponse = JSON.parse(exactMatch.agentResponse);
                            const forecastTime = exactMatch.timestamp;
                            if (Date.now() - forecastTime < 24 * 60 * 60 * 1000) {
                                return {
                                    content: [{ type: "text", text: JSON.stringify(cachedResponse, null, 2) }]
                                };
                            }
                        } catch (e) {
                            // ignore parse errors and proceed to recalculate
                        }
                    }
                }

                // Retrieve historical data to compute trend manually using simple-statistics
                const database = getDb();
                const stmt = database.prepare(`
                    SELECT value, timestamp
                    FROM metrics
                    WHERE metric_name = ? AND company = ?
                    ORDER BY timestamp ASC
                `);

                const rows = stmt.all(metric_name, targetCompany) as { value: number, timestamp: string }[];
                if (rows.length < 2) {
                     return {
                        content: [{ type: "text", text: `Insufficient historical data to forecast ${metric_name} for ${targetCompany}. Need at least 2 data points.` }],
                        isError: true
                    };
                }

                // Generate basic forecast using the forecasting MCP's linear regression model
                const baseForecast = forecast_metric(metric_name, horizonDays, targetCompany);

                // Calculate trend using simple-statistics linear regression on recent data
                const MS_PER_DAY = 1000 * 60 * 60 * 24;
                const data: [number, number][] = rows.map(row => [new Date(row.timestamp).getTime() / MS_PER_DAY, row.value]);
                const regression = ss.linearRegression(data);

                let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
                if (regression.m > 0.05) trend = 'increasing';
                else if (regression.m < -0.05) trend = 'decreasing';

                // Format base forecast values
                const formattedForecast = baseForecast.forecast.map(f => ({
                    date: f.date,
                    predicted_value: f.predicted_value,
                    lower_bound: f.lower_bound || f.predicted_value,
                    upper_bound: f.upper_bound || f.predicted_value
                }));

                // Fetch corporate strategy from Brain MCP memory to align the forecast recommendations
                const strategyInfo = await readStrategy(memory, targetCompany);

                const llm = createLLM();
                const prompt = `
You are the Ghost Mode Financial Modeler and Capacity Planner.
Analyze the following demand forecast and corporate strategy context.
Generate a JSON object containing two arrays of strings: "recommendations" and "policy_implications".

Metric: ${metric_name}
Horizon: ${horizonDays} days
Trend: ${trend}
Current Strategy:
${strategyInfo ? JSON.stringify(strategyInfo, null, 2) : "No specific strategy found. Assume standard growth and stability goals."}
Forecast Data:
${JSON.stringify(formattedForecast.slice(0, 5), null, 2)} ... (truncated)

Provide output strictly in this JSON format:
{
  "recommendations": ["Scale swarm capacity by X%", ...],
  "policy_implications": ["Update auto_approve_threshold to Y", ...]
}
`;
                // Generate insights
                const llmResponse = await llm.generate(prompt, []);

                let insights: any = { recommendations: [], policy_implications: [] };
                try {
                    // robust JSON extraction
                    const jsonStr = (llmResponse.message || llmResponse.thought || llmResponse).toString();
                    const cleanStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
                    const firstBrace = cleanStr.indexOf("{");
                    const lastBrace = cleanStr.lastIndexOf("}");
                    if (firstBrace !== -1 && lastBrace !== -1) {
                        insights = JSON.parse(cleanStr.substring(firstBrace, lastBrace + 1));
                    }
                } catch (e) {
                    console.error("[Demand Forecasting] Failed to parse LLM response for forecasting insights", e);
                }

                const responseObj: DemandForecastResponse = {
                    metric_name,
                    company: targetCompany,
                    forecast_values: formattedForecast,
                    trend,
                    recommendations: insights.recommendations || [],
                    policy_implications: insights.policy_implications || []
                };

                // Cache the new forecast result in memory
                await memory.store(
                    cacheKey, // task id / cache key
                    `Forecast request for ${metric_name} over ${horizonDays} days for ${targetCompany}`, // user prompt
                    JSON.stringify(responseObj), // solution
                    ["demand_prediction", targetCompany, metric_name, "phase_29"], // tags
                    targetCompany
                );

                return {
                    content: [{ type: "text", text: JSON.stringify(responseObj, null, 2) }]
                };

            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error generating demand forecast: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
}
