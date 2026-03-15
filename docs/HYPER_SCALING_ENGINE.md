# Hyper-Scaling Engine

The Hyper-Scaling Engine is a core subsystem introduced in Phase 38, designed to enable the agency ecosystem to handle hundreds of concurrent clients. It focuses on extreme cost-efficiency, intelligent resource allocation, and dynamic capacity management.

## Purpose

As the agency ecosystem grows, managing swarms manually or through basic reactive scaling becomes inefficient and costly. The Hyper-Scaling Engine provides predictive and policy-driven mechanisms to ensure:

1.  **Demand-Driven Allocation**: Swarms are spun up or down based on aggregated signals across all clients, avoiding both bottlenecks and over-provisioning.
2.  **Global Cost Optimization**: LLM model usage is intelligently routed. Routine tasks are directed to cheaper, faster models (e.g., GPT-4o-mini, Haiku), while complex reasoning is reserved for top-tier models.
3.  **Strict Budget Enforcement**: System-wide resource usage is constrained by corporate policies, preventing runaway costs during usage spikes.

## Architecture & Integration

The Hyper-Scaling Engine runs as a dedicated MCP Server (`src/mcp_servers/hyper_scaling_engine/index.ts`) and exposes the following tools:

### `evaluate_massive_demand`
Calculates the required swarm capacity based on the total number of active clients and their projected task volume. It outputs a recommended number of swarms and a bottleneck risk assessment.

### `optimize_global_costs`
Determines the optimal model routing strategy for a given scale. As the number of swarms increases, it enforces stricter tiering logic to maintain profit margins.

### `enforce_resource_budget`
Integrates with the `PolicyEngine` to ensure the requested number of swarms does not exceed the maximum allowed by the active corporate policy.

### `simulate_scaling_scenario`
A forecasting tool that projects ecosystem costs, required swarms, and potential system health issues for hypothetical scaling targets (e.g., 200, 500 clients).

## Backward Compatibility

To maintain compatibility with existing workflows, the Hyper-Scaling Engine's tools are also exported and registered within the `business_ops` MCP Server. This allows orchestrators and planners already using `business_ops` to leverage the new scaling capabilities seamlessly.
