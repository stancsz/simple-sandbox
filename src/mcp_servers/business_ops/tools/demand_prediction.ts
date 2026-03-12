import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import * as ss from "simple-statistics";

// Helper to spawn and connect to forecasting MCP server
async function withForecastingClient<T>(callback: (client: Client) => Promise<T>): Promise<T> {
    const srcPath = join(process.cwd(), "src", "mcp_servers", "forecasting", "index.ts");
    const distPath = join(process.cwd(), "dist", "mcp_servers", "forecasting", "index.js");

    let command = "node";
    let args = [distPath];

    if (existsSync(srcPath) && !existsSync(distPath)) {
        command = process.platform === "win32" ? "npx.cmd" : "npx";
        args = ["tsx", srcPath];
    } else if (!existsSync(distPath)) {
        throw new Error(`Forecasting MCP Server not found.`);
    }

    const transport = new StdioClientTransport({ command, args });
    const client = new Client({ name: "business_ops-demand-predictor", version: "1.0.0" }, { capabilities: {} });

    await client.connect(transport);
    try {
        return await callback(client);
    } finally {
        try { await client.close(); } catch {}
    }
}

export function registerDemandPredictionTools(server: McpServer) {
    server.tool(
        "forecast_resource_demand",
        "Predicts future resource requirements based on historical time-series data using statistical models.",
        {
            horizon_days: z.number().default(90).describe("Number of days into the future to forecast."),
            company: z.string().optional().describe("The company/client identifier for namespacing.")
        },
        async ({ horizon_days, company }) => {
            const companyId = company || "default";

            // 1. Load forecasting rules
            let rules: Record<string, any> = {};
            try {
                const rulesPath = join(process.cwd(), "src", "config", "forecasting_rules.json");
                rules = JSON.parse(readFileSync(rulesPath, "utf-8"));
            } catch (e) {
                console.warn("Failed to load forecasting_rules.json, proceeding with empty rules.", e);
            }

            // 2. Fetch metrics
            let metricNames: string[] = [];
            let allPoints: Record<string, { timestamp: string, value: number }[]> = {};

            await withForecastingClient(async (client) => {
                const listResult: any = await client.callTool({
                    name: "list_metric_series",
                    arguments: { company: companyId }
                });
                if (!listResult.isError && listResult.content[0]) {
                    metricNames = JSON.parse(listResult.content[0].text);
                }

                for (const metric of metricNames) {
                    const pointsResult: any = await client.callTool({
                        name: "get_metric_points",
                        arguments: { metric_name: metric, company: companyId }
                    });
                    if (!pointsResult.isError && pointsResult.content[0]) {
                        allPoints[metric] = JSON.parse(pointsResult.content[0].text);
                    }
                }
            });

            const MS_PER_DAY = 1000 * 60 * 60 * 24;
            const predictions: Record<string, any> = {};
            const recommendations: any[] = [];

            // 3. Process each metric
            for (const [metric, points] of Object.entries(allPoints)) {
                if (points.length < 2) continue;

                // Sort ascending by time
                points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

                // Prepare data for simple-statistics
                const data: [number, number][] = points.map(p => [
                    new Date(p.timestamp).getTime() / MS_PER_DAY,
                    p.value
                ]);

                // Linear regression
                const regressionLine = ss.linearRegression(data);
                const predictor = ss.linearRegressionLine(regressionLine);

                // Confidence bounds (std dev of residuals)
                let stdDev = 0;
                if (data.length > 2) {
                    const residuals = data.map(point => point[1] - predictor(point[0]));
                    stdDev = ss.sampleStandardDeviation(residuals);
                }
                const marginOfError = 1.96 * stdDev;

                // Predict future max value in the horizon
                const lastDateMs = new Date(points[points.length - 1].timestamp).getTime();
                let maxPredicted = -Infinity;
                let maxPredictedUpper = -Infinity;

                for (let i = 1; i <= horizon_days; i++) {
                    const futureDay = (lastDateMs + i * MS_PER_DAY) / MS_PER_DAY;
                    const predictedValue = predictor(futureDay);
                    maxPredicted = Math.max(maxPredicted, predictedValue);
                    maxPredictedUpper = Math.max(maxPredictedUpper, predictedValue + marginOfError);
                }

                // Never predict negative values
                maxPredicted = Math.max(0, maxPredicted);
                maxPredictedUpper = Math.max(0, maxPredictedUpper);

                predictions[metric] = {
                    max_predicted_value: Number(maxPredicted.toFixed(2)),
                    upper_bound: Number(maxPredictedUpper.toFixed(2))
                };

                // 4. Map to resource recommendations based on rules
                if (rules[metric]) {
                    const rule = rules[metric];
                    // Example ratio logic: required_resource = (predicted / base) * ratio
                    // Or simplified: required = predicted * ratio
                    let requiredAmount = Math.ceil(maxPredicted * rule.ratio);

                    if (requiredAmount > 0) {
                        recommendations.push({
                            metric,
                            resource: rule.resource,
                            required_amount: requiredAmount,
                            reason: `Predicted max ${metric} of ${predictions[metric].max_predicted_value} over next ${horizon_days} days.`
                        });
                    }
                }
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        status: "success",
                        horizon_days,
                        predictions,
                        recommendations,
                        confidence_intervals: "Calculated via sample standard deviation of residuals (95% CI approximation)."
                    }, null, 2)
                }]
            };
        }
    );
}
