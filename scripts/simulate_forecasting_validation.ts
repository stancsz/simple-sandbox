import { record_metric, forecast_metric, getDb, _resetDb } from "../src/mcp_servers/forecasting/models.js";
import { evaluate_forecast_accuracy_legacy, simulate_historical_decisions } from "../src/mcp_servers/forecasting/validation.js";

const testCompany = "demo-agency-corp";
const testMetric = "client_demand";

async function runSimulation() {
    console.log("=== Phase 29: Forecasting Validation Simulation ===");

    // Clear previous data
    _resetDb();

    const baseDateMs = new Date("2023-01-01T00:00:00Z").getTime();
    const msPerDay = 1000 * 60 * 60 * 24;

    const historicalDays = 90;
    const horizonDays = 30;
    const totalDays = historicalDays + horizonDays;

    console.log(`\n1. Simulating ${totalDays} days of historical data (client demand)...`);

    for (let i = 0; i < totalDays; i++) {
        // Create an upward trend with some seasonality (sine wave) and noise
        const trend = i * 2;
        const seasonality = Math.sin(i / 7) * 20; // Weekly seasonality
        const noise = (Math.random() - 0.5) * 10;

        let value = 100 + trend + seasonality + noise;
        value = Math.max(0, value); // Ensure it doesn't drop below 0

        record_metric(testMetric, value, new Date(baseDateMs + (i * msPerDay)).toISOString(), testCompany);
    }

    console.log("Data simulation complete.");

    console.log(`\n2. Forecasting & Comparison (Training on ${historicalDays} days, predicting ${horizonDays} days)...`);

    const accuracyResult = evaluate_forecast_accuracy_legacy(testMetric, historicalDays, horizonDays, testCompany);

    console.log(`Forecast Evaluation Metrics for ${testMetric}:`);
    console.log(`- Mean Absolute Error (MAE): ${accuracyResult.metrics.mae}`);
    console.log(`- Root Mean Squared Error (RMSE): ${accuracyResult.metrics.rmse}`);
    console.log(`- Mean Absolute Percentage Error (MAPE): ${(accuracyResult.metrics.mape * 100).toFixed(2)}%`);

    console.log(`\n3. Decision Quality Evaluation (Simulating swarm scaling decisions)...`);

    const decisionResult = await simulate_historical_decisions(testMetric, historicalDays, horizonDays, testCompany);

    console.log("Decision Simulation Results:");
    console.log(`- Naive Allocation (based on past max): ${decisionResult.decisions.naive_allocation.toFixed(2)}`);
    console.log(`- Forecast Allocation: ${decisionResult.decisions.forecast_allocation.toFixed(2)}`);
    console.log(`- Optimal Allocation (actual max): ${decisionResult.decisions.optimal_allocation.toFixed(2)}`);

    console.log("\nQuality Improvement Metrics:");
    console.log(`- Underprovisioning Reduction: ${decisionResult.quality_improvement.underprovisioning_reduction.toFixed(2)}`);
    console.log(`- Overprovisioning Reduction: ${decisionResult.quality_improvement.overprovisioning_reduction.toFixed(2)}`);
    console.log(`- Total Improvement Score: ${decisionResult.improvement_score.toFixed(2)}`);

    console.log("\n=== Simulation Complete ===");
}

runSimulation().catch(console.error);
