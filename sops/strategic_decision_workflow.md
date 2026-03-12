# Strategic Decision Workflow

## Purpose
This SOP dictates the automated workflow for translating predictive forecasts into actionable corporate strategy adjustments (pivots) and monitoring their outcomes.

## Actors
- `strategic_decision` MCP Server
- `forecasting` MCP Server
- `brain` MCP Server
- `business_ops` MCP Server

## Cycle: Evaluate -> Execute -> Monitor

### 1. Evaluate Strategic Pivot
**Trigger:** Triggered systematically or manually during corporate review cycles.
**Action:**
- The `evaluate_strategic_pivot` tool queries the `brain` MCP for the current Corporate Strategy.
- It queries the `forecasting` MCP for time-series projections of a critical metric (e.g., `revenue`, `token_budget`, `margin`).
- An LLM acts as the Chief Strategy Officer, comparing the forecast trajectory against strategic goals.
- **Output:** If misaligned, the LLM outputs a structured `StrategicPivot` containing recommended actions, target metrics, and policy updates. If aligned, it outputs NO PIVOT REQUIRED.

### 2. Execute Autonomous Decision
**Trigger:** Automatically chained upon receiving a valid `StrategicPivot` recommendation.
**Action:**
- The `execute_autonomous_decision` tool takes the `StrategicPivot`.
- If `policy_updates` are required (e.g., adjusting `min_margin` or `risk_tolerance`), it connects to the `business_ops` MCP and executes `update_operating_policy`.
- If resources need shifting, it connects to `business_ops` and triggers `balance_fleet_resources`.
- The decision, rationale, and targeted outcomes are permanently recorded in the Brain's Episodic Memory under `autonomous_decision`.

### 3. Monitor Decision Outcomes
**Trigger:** Scheduled daily or weekly via cron.
**Action:**
- The `monitor_decision_outcomes` tool queries Episodic Memory for un-evaluated `autonomous_decision` records.
- It reconnects to the `forecasting` MCP to gather the latest current state or updated projections for the target metrics.
- The LLM evaluates if the trajectory improved post-decision.
- The outcome (`success`, `failure`, `mixed`), a score (0-100), and learning feedback are appended to the decision record in Episodic Memory, closing the recursive optimization loop.

## Constraints
- Policy updates must not exceed limits defined in `CorporatePolicy.autonomous_decision_authority`.
- All outcomes must be systematically fed back into memory to ensure the Brain learns from failed pivots.