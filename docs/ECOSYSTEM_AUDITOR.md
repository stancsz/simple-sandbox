# Ecosystem Auditor MCP Server

This server implements Phase 37: Production Ecosystem Observability & Governance.

## Objective
Enable the root agency to monitor, audit, and explain the behavior and decisions of the entire ecosystem of child agencies, ensuring transparency, compliance, and debuggability in production.

## Tools
- `generate_ecosystem_audit_report`: Synthesizes cross-agency logs into actionable insights and strategic recommendations.

## `generate_ecosystem_audit_report`

The tool parses raw audit logs stored in `.agent/audit_logs/` (in `.jsonl` format) based on a specified `timeframe` and `focus_area`.

### Input Schema

- `timeframe` (string): Timeframe to audit, e.g., 'last_24_hours' or 'last_7_days'.
- `focus_area` (string): One of 'communications', 'policy_changes', 'morphology_adjustments', or 'all'. Limits analysis to specific event types.

### Output Schema (`EcosystemAuditReport`)

Returns a detailed, structured JSON representing ecosystem-wide intelligence:

- `summary`: A synthesized high-level narrative.
- `communication_patterns`: Identified cross-agency delegation and communication trends.
- `policy_evolution`: Traced policy and rule changes affecting autonomy.
- `morphology_changes`: Insight into spawned, merged, or retired agencies.
- `anomalies`: Unexpected behaviors or structural anomalies.
- `recommendations`: Actionable improvements such as merging redundant agencies or tweaking communication rules.
- `raw_events_analyzed`: Number of individual logs fed into the analysis.