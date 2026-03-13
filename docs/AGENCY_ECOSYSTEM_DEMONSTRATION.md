# Phase 33: Multi-Agency Ecosystem Showcase

The Agency Ecosystem Demonstration showcases the power of the `agency_orchestrator` MCP server working in tandem with the enhanced Brain MCP tools to seamlessly coordinate and execute complex, multi-agency projects.

## Overview
This demonstration proves that the Simple-CLI root agency can act as a Meta-Orchestrator to:
1. Spawn specialized child agencies (e.g., `agency_frontend`, `agency_backend`, `agency_devops`).
2. Parse a complex project specification and distribute dependent tasks to the most suitable child agencies.
3. Track and monitor progress across all agencies while actively resolving execution deadlocks and inter-agency dependencies.
4. Utilize `cross_agency_pattern_recognition` via the Brain MCP to synthesize operational knowledge from the decentralized ecosystem.

## Components

- **`showcase_config.json`**: Defines the child agencies to be spawned, including their IDs, niches, budgets, and capabilities.
- **`complex_project_spec.json`**: The detailed, realistic JSON project specification with tasks and dependencies.
- **`orchestrate.ts`**: A Node.js orchestration script that acts as the core demo for task assignment and status monitoring.
- **`scripts/validate_agency_ecosystem.ts`**: An end-to-end validation script that orchestrates a full mock project specifically to validate task completion, cross-agency pattern retrieval, and the generation of an operational report.

## How to Run the Demonstration Script

To run the interactive orchestration demo walkthrough:
```bash
npx tsx demos/agency_ecosystem_showcase/orchestrate.ts
```

*(Note: Execution requires a valid `OPENAI_API_KEY` or other supported LLM API key configured in your environment, as it utilizes the `EpisodicMemory` embedding functionality.)*

## How to Run the End-to-End Validation Script

The validation script runs automatically as part of our integration test suite. However, it can also be triggered manually to simulate an end-to-end project orchestration, failure recovery, and cross-agency pattern recognition report generation:

```bash
npx tsx scripts/validate_agency_ecosystem.ts
```

### Interpreting the Validation Results

Upon successful execution, the validation script will generate a markdown report (`demos/agency_ecosystem_showcase/validation_project/validation_report.md`).

This report includes:
- **Project Status**: The final state of all orchestrated tasks.
- **Milestones**: A breakdown of the workflow execution flow.
- **Coordination Issues**: An overview of simulated deadlocks or failures that the orchestrator automatically recovered from.
- **Cross-Agency Pattern Recognition Insights**: Summarized insights synthesized from the memories of the participating child agencies, ensuring continuous learning across the biosphere.
- **Validation Result**: Will display `PASS` if the orchestration completed correctly.
