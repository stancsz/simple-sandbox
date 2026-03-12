# Forecasting Metrics Documentation

This document outlines the metrics schema and logic used by the 'Demand Prediction' and 'Forecasting' MCP tools to inform financial and capacity planning.

## Core Forecasting Metrics

### 1. Token Usage
- **Name:** `llm_token_usage`
- **Description:** Total number of LLM tokens consumed over a specific period.
- **Trend Logic:** Uses `simple-statistics` linear regression. A slope (`m`) > 0.05 indicates an `increasing` trend, while < -0.05 indicates a `decreasing` trend.
- **Policy Link:** Drives recommendations to adjust `auto_approve_threshold` or limit `max_agents_per_swarm` if costs are projected to exceed limits.

### 2. API Call Volume
- **Name:** `api_calls`
- **Description:** Total volume of internal and external API calls.
- **Trend Logic:** Uses linear regression to forecast load on the system.
- **Policy Link:** Used for capacity planning recommendations like 'Scale swarm capacity'.

### 3. Revenue Projections
- **Name:** `revenue`
- **Description:** Expected revenue based on signed contracts and historical run rates.
- **Trend Logic:** Modeled via historical data to inform margin forecasting.

## Architecture & Integration

- **Forecasting Database:** Data is recorded via `record_metric` and stored in `sqlite` (`.agent/data/forecasting.db`).
- **Demand Prediction:** `forecast_demand` in `business_ops` queries the forecasting DB, recalculates trends locally using `simple-statistics`, incorporates `CorporateStrategy` via the `Brain` MCP, and outputs JSON with recommended policy implications.
- **Caching:** Output is stored in EpisodicMemory using cache keys (e.g., `demand_forecast_llm_token_usage_30d_@simple-cli/showcase`) for idempotency (valid for 24 hours).
