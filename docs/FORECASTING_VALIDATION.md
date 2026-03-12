# Forecasting Validation Methodology

This document outlines the validation methodology for the Phase 29 Advanced Planning & Forecasting system.

## 1. Overview

The forecasting validation system evaluates the accuracy of the forecasting engine's predictions against ground-truth data, allowing the autonomous system to measure its own performance and simulate decision quality.

It uses a holdout-set approach (e.g., training on 90 days of historical data, predicting 30 days ahead, and comparing predictions with actual 30-day recorded values).

## 2. Core Validation Metrics

The system calculates three primary error metrics via `evaluate_forecast_accuracy`:

*   **MAE (Mean Absolute Error):** Measures the average magnitude of the errors in a set of predictions, without considering their direction. It’s the average over the test sample of the absolute differences between prediction and actual observation.
    *   *Interpretation:* A lower MAE means the model is generally closer to the actual values in absolute terms.

*   **RMSE (Root Mean Squared Error):** A quadratic scoring rule that measures the average magnitude of the error. Since errors are squared before being averaged, RMSE gives a relatively high weight to large errors.
    *   *Interpretation:* A high RMSE compared to MAE indicates large variance in the individual errors.

*   **MAPE (Mean Absolute Percentage Error):** The average absolute percentage difference between the forecasted values and actual values.
    *   *Interpretation:* Often the easiest metric to interpret. A MAPE of 10% means the model's predictions are, on average, off by 10%.

## 3. Decision Quality Simulation

The true value of forecasting isn't just accuracy; it's the quality of the decisions made using those forecasts. The `simulate_historical_decisions` tool models past capacity planning decisions.

It compares three resource allocation strategies:

1.  **Optimal Allocation:** Using the actual maximum demand (impossible in reality, but the baseline).
2.  **Naive Allocation:** Allocating resources based on the maximum observed demand in the *past* (e.g., "we needed 10 agents last month, so provision 10 this month").
3.  **Forecast Allocation:** Allocating resources based on the maximum *predicted* demand for the upcoming period.

The simulation returns a **Total Improvement Score** by summing:

*   **Underprovisioning Reduction:** How many fewer resources we lacked by using the forecast compared to the naive approach.
*   **Overprovisioning Reduction:** How many excess resources we avoided deploying by using the forecast.

A positive improvement score means the forecast-informed decision was objectively better for the business than relying on past maxes.

## 4. Policy Engine Integration

Validation thresholds are defined in `src/mcp_servers/forecasting/config.json`. For example, `mape_threshold` is typically set to 15%.

If the `evaluate_forecast_accuracy` tool calculates a MAPE higher than the threshold, it autonomously records a `forecasting_alert` episode in `EpisodicMemory`. The Policy Engine and Strategic Horizon Scanner continuously monitor these alerts. If forecasting accuracy degrades significantly, the Policy Engine may autonomously:

*   Disable auto-scaling features.
*   Require human-in-the-loop approval for capacity adjustments.
*   Trigger a model re-evaluation or suggest switching forecasting algorithms.

## 5. Running Simulations

You can manually run a validation simulation script to test the engine:

```bash
npx tsx scripts/simulate_forecasting_validation.ts
```

This simulates 90 days of client demand, forecasts 30 days, calculates error metrics, and outputs the decision quality improvement score.
