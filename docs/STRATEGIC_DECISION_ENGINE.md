# Strategic Decision Engine

## Introduction
The Strategic Decision Engine (Phase 30) serves as the culmination of the 4-Pillar Vision's recursive optimization layer. It acts as the autonomous "Chief Strategy Officer," transforming passive time-series projections (from Phase 29: Forecasting) into active corporate strategy adjustments, operating policy updates, and swarm resource allocations.

## Architecture

The engine is encapsulated within the `strategic_decision` MCP server. It connects asynchronously to the entire enterprise suite of MCPs:

1. **`strategic_decision` MCP**:
    - **`evaluate_strategic_pivot`**: The analytical core. Connects to `forecasting` to retrieve predictive metrics, and connects to `brain` to read the current `CorporateStrategy`. Uses a robust LLM to identify misalignment between projected reality and corporate goals.
    - **`execute_autonomous_decision`**: The actuation arm. Receives a structured pivot recommendation. Connects to `business_ops` to execute `update_operating_policy` (e.g., tweaking `min_margin` or `risk_tolerance`) and triggers `balance_fleet_resources`. Records the intent, target metrics, and rationale to the Brain's `EpisodicMemory`.
    - **`monitor_decision_outcomes`**: The feedback loop. Re-evaluates historical autonomous decisions by querying their target metrics against current `forecasting` data. Scores the decision's efficacy (0-100) and writes learnings back into Episodic Memory.

## Integration with 4-Pillar Vision
- **SOP-as-Code**: Strategic decisions are not ephemeral; they are codified into explicit `update_operating_policy` actions that the entire swarm fleet must immediately obey.
- **Recursive Optimization**: The `monitor_decision_outcomes` loop ensures the system continuously learns. Failed pivots result in negative scores and explicit learnings, preventing the system from repeating strategic errors.
- **Company Context**: Every decision is scoped by a `company` namespace, allowing multi-tenant strategic optimization across different subsidiaries or clients.
- **Ghost Mode**: The entire evaluate -> execute -> monitor loop is fully autonomous, enabling zero-touch strategic management as long as the outputs remain within `CorporatePolicy.autonomous_decision_authority` constraints.

## Flow Diagram
```mermaid
graph TD
    Forecasting[Forecasting MCP (Metrics)] -->|Forecast Data| Evaluate[evaluate_strategic_pivot]
    Brain[Brain MCP (Strategy)] -->|Strategy Context| Evaluate
    Evaluate -->|StrategicPivot JSON| Execute[execute_autonomous_decision]
    Execute -->|Policy Update| BusinessOps[Business Ops MCP]
    Execute -->|Balance Resources| BusinessOps
    Execute -->|Store Decision Intent| EpisodicMemory[(Episodic Memory)]
    Monitor[monitor_decision_outcomes] -->|Query Pending Decisions| EpisodicMemory
    Monitor -->|Query Current State| Forecasting
    Monitor -->|Write Outcome Score| EpisodicMemory
```