# Phase 30: Autonomous Strategic Decision Engine

The Autonomous Strategic Decision Engine bridges the gap between predictive forecasting (Phase 29) and actionable business execution. It allows the Simple Biosphere to synthesize historical trends, predict future outcomes, and autonomously implement strategic pivots.

## Architecture Overview

The system operates across a clear pipeline:
**Forecast → Analysis → Decision → Execution → Policy Update**

### 1. Forecast (Phase 29 Integration)
The `forecasting` MCP tracks metrics (e.g., token usage, financial costs, API latency) and generates future projections. These projections are stored in the Brain MCP's `EpisodicMemory` as `strategic_forecast` records.

### 2. Analysis & Decision (`brain` MCP)
The `make_strategic_decision` tool takes recent forecast data and compares it against the active `CorporateStrategy`.
- It evaluates market conditions, expected growth, and risk margins.
- It outputs a strategic decision, a detailed rationale, and a confidence score.
- **Autonomy Threshold:** If the confidence score is >= 0.8, the system automatically calls `propose_strategic_pivot` to officially update the Corporate Strategy in memory.

### 3. Execution (`business_ops` MCP)
The `execute_strategic_initiative` tool translates the high-level decision into ground-level actions.
- It determines which operational policy parameters (e.g., `max_fleet_size`, `base_pricing_multiplier`) need to be adjusted and calls `update_operating_policy`.
- It leverages the existing `generate_strategic_initiatives` logic to analyze operational KPIs and generate trackable, prioritized issues in the company's Linear project.

### 4. Audit Trail
Both the decision-making process (`autonomous_decision`) and the execution results (`autonomous_decision_execution`) are permanently logged in the Brain's `EpisodicMemory` for full transparency and recursive learning.

## Tool Usage Examples

### `make_strategic_decision` (Brain MCP)
```json
{
  "forecast_data": "[{\"metric\":\"token_usage\", \"predicted_value\": 1500000, \"upper_bound\": 1800000}]",
  "company": "acme_corp"
}
```

### `execute_strategic_initiative` (Business Ops MCP)
```json
{
  "strategic_decision": "{\"decision\": \"Increase server capacity by 20% to handle expected surge.\", \"rationale\": \"Forecasts show a high likelihood of increased API usage...\"}",
  "company": "acme_corp"
}
```

## Next Steps
Future integrations will connect this decision engine directly into the Commerce Pipeline (Phase 30) for automated service packaging adjustments and autonomous bidding constraints.
