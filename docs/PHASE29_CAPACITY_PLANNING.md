# Phase 29: Capacity Planning

## Overview

The **Capacity Planning** component in Phase 29 leverages our Time-Series Forecasting models (`forecast_metric`) alongside the Corporate Policy engine to proactively predict resource demand and safely scale our operations.

It operates within the **Business Ops MCP Server**, analyzing the forecasted resource demands (CPU, memory, tokens) across a set horizon against our active infrastructure capacities and defined limits.

## Architecture

1. **`forecasting` MCP Server**: The source of truth for time-series projections of system metrics (`token_usage`, `cpu_usage`, `memory_usage`).
2. **`business_ops` MCP Server (`propose_capacity_adjustment` Tool)**: Orchestrates the planning by comparing forecasted needs against current constraints.
3. **`brain` MCP Server (Episodic Memory)**: Manages and version-controls the `CorporatePolicy`, including the `token_budget` limit. Autonomous decisions and active parameter updates are stored here.
4. **Kubernetes Integration (`@kubernetes/client-node`)**: Polls real-time K8s node capacities to evaluate CPU bounds and issue `scale_up_nodes` / `reduce_nodes` decisions.

## Components & Logic

The `propose_capacity_adjustment` tool supports the following configuration parameters:
* **`horizon_days`**: The future prediction window (default 30 days).
* **`cpu_threshold`**: The safe utilization percentage (default 80%) before triggering a node scale-up.
* **`memory_threshold`**: The threshold for memory scaling constraints.
* **`yoloMode`**: Determines execution safety.
  * *`false` (Dry Run)*: Only outputs recommendations.
  * *`true` (Autonomous)*: Writes to Episodic Memory, marking an `autonomous_decision` and directly creating a new version of the `CorporatePolicy` to adjust `token_budget`.

### Flow
1. Fetch current `token_budget` from the active policy in EpisodicMemory.
2. Fetch `CoreV1Api` for cluster capacities (mocked fallback if out-of-cluster).
3. Connect locally via `StdioClientTransport` to the `forecasting` MCP.
4. Retrieve forecasts for tokens and CPU.
5. Determine scale up / maintain / scale down recommendations.
6. Commit actions to memory if `yoloMode=true`.

## SOP: Capacity Planning Execution

To integrate this effectively:
1. Ensure historical metrics are running via the `Health Monitor` dispatch (`record_metric`).
2. Run `propose_capacity_adjustment` daily via the Scheduler.
3. Use Ghost Mode logic to review recommendations before execution, or apply `yoloMode` if policy supports it.

See `sops/capacity_planning_workflow.md` for standard operating procedures.