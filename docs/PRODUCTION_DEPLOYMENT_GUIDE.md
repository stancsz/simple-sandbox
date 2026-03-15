# Production Deployment Guide

This guide serves as the authoritative manual for deploying and managing the Simple-CLI digital agency ecosystem in a production environment. It covers the complete lifecycle: deploying the root agency, spawning child agencies, configuring multi-region high availability, setting up disaster recovery, enabling security monitoring, and orchestrating the collective intelligence network.

## Introduction & Architecture Overview

The Simple-CLI ecosystem is built on a hierarchical architecture of autonomous digital agencies.
*   **Root Agency**: The primary orchestrator. It manages the global context, allocates resources, and monitors the overall health of the ecosystem. It is deployed as the central Hub.
*   **Child Agencies**: Specialized autonomous agents spawned by the Root Agency to handle specific domains (e.g., frontend development, data science, financial operations). Each child operates in an isolated environment with its own context and memory.
*   **Federation**: The protocol that connects these agencies, enabling task delegation, resource sharing, and cross-agency learning (Collective Intelligence).

This distributed architecture ensures high scalability, fault tolerance, and specialized execution without cognitive overload on a single agent.

## Prerequisites

Before beginning the deployment, ensure the following requirements are met:

### System Requirements
*   **Kubernetes Cluster**: Version 1.24+ recommended.
*   **Helm**: Version 3.8+ installed locally.
*   **Node.js**: Version 18+ (for local CLI interactions and automation scripts).

### Cloud Infrastructure (AWS / GCP)
*   Access to deploy StatefulSets, PersistentVolumeClaims (PVCs), and Ingress controllers.
*   For multi-region setups: Configured VPC peering or cross-region routing.

### Required APIs & Integrations
*   **LLM Providers**: API keys for OpenAI, Anthropic, DeepSeek, or others as configured in your `mcp.json`.
*   **Business Tools** (Optional but recommended for full capability):
    *   **Xero/QuickBooks**: For automated billing and financial operations.
    *   **HubSpot/Salesforce**: For CRM synchronization and lead management.
    *   **Linear/Jira**: For project delivery and issue tracking.

## Root Agency Deployment

The Root Agency is deployed using our provided Helm chart. This establishes the core orchestrator, the centralized Brain (memory), and the primary operational context.

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/stan-chen/simple-cli.git
    cd simple-cli
    ```

2.  **Configure `values.yaml`**:
    Copy the default values file and customize it for your environment. Pay special attention to persistent storage sizes and resource limits.
    ```bash
    cp deployment/chart/simple-cli/values.yaml deployment/chart/simple-cli/values-production.yaml
    ```
    *Example `values-production.yaml` snippet:*
    ```yaml
    agent:
      resources:
        limits:
          cpu: "2"
          memory: "4Gi"
    brain:
      persistence:
        size: "20Gi"
    ```

3.  **Deploy via Helm**:
    Install the Root Agency into its own namespace (e.g., `agency-root`).
    ```bash
    helm upgrade --install simple-cli deployment/chart/simple-cli \
      --namespace agency-root \
      --create-namespace \
      -f deployment/chart/simple-cli/values-production.yaml
    ```

4.  **Verify Deployment**:
    Ensure all pods in the StatefulSets are running.
    ```bash
    kubectl get pods -n agency-root
    ```

5.  **Initialize Corporate Strategy**:
    Once the pod is running, use the CLI or an MCP tool call to inject the initial `CorporateStrategy` into the Root Agency's memory. This defines its overarching goals and constraints.

## Child Agency Spawning

The Root Agency can dynamically spawn specialized Child Agencies using the **Agency Orchestrator MCP**.

1.  **Trigger Spawning via CLI**:
    You can instruct the Root Agency to spawn a child via a natural language command:
    ```bash
    simple "Spawn a new child agency for 'Frontend Modernization' with a token budget of 500."
    ```

2.  **Under the Hood (MCP Call)**:
    This command invokes the `spawnChildAgency` tool in the `agency_orchestrator` MCP server.
    *   **Context Generation**: The Root Agency extracts relevant strategy for "Frontend Modernization".
    *   **Resource Allocation**: It checks the `CorporatePolicy` to ensure the requested budget (500) is within limits.
    *   **Isolation**: A new, isolated `.agent` directory and memory store are created for the child.
    *   **Registration**: The child is registered in the Distributed Ledger and Federation Protocol.

3.  **Managing Child Agencies**:
    *   **Merge**: If resources are underutilized, use `merge_child_agencies` to consolidate.
    *   **Retire**: If an agency fails consistently, use `retire_child_agency` to archive it.

## Multi-Region Setup

For high availability and disaster recovery, deploy the ecosystem across multiple regions.

1.  **Enable Multi-Region in `values.yaml`**:
    Configure the regions and their node selectors.
    ```yaml
    multiRegion:
      enabled: true
      regions:
        - name: "us-east-1"
          nodeSelector:
            topology.kubernetes.io/region: us-east-1
          storageClass: "gp3-us-east"
        - name: "eu-west-1"
          nodeSelector:
            topology.kubernetes.io/region: eu-west-1
          storageClass: "gp3-eu-west"
    ```

2.  **Deploy the Updated Chart**:
    ```bash
    helm upgrade --install simple-cli deployment/chart/simple-cli \
      --namespace agency-root \
      -f deployment/chart/simple-cli/values-production.yaml
    ```

3.  **Geographic Routing**:
    Ensure your Ingress controller (e.g., AWS ALB, NGINX) is configured to route traffic based on proximity or health checks. The chart includes `ingress-multiregion.yaml` for this purpose.

4.  **Failover Simulation**:
    To test failover, simulate an outage using the `simulate_regional_outage` MCP tool, which updates the `/etc/config/failedRegions` ConfigMap, triggering the readiness probes to fail in the targeted region.

## Disaster Recovery

The system aims for a **1-hour recovery SLA** following a partial or complete data loss.

1.  **Locate Backup**:
    Identify the latest backup archive (`.enc` file) in your configured storage (local `.agent/backups/` or S3).

2.  **Clear Corrupted State (If Necessary)**:
    ```bash
    # WARNING: Only run if restoring over a corrupted active state.
    rm -rf .agent/brain .agent/companies
    ```

3.  **Execute Restoration Script**:
    Use the provided `quick_restore.ts` script, ensuring the `BACKUP_ENCRYPTION_KEY` is in your environment.
    ```bash
    export BACKUP_ENCRYPTION_KEY="your-secure-key"
    npx tsx scripts/quick_restore.ts .agent/backups/backup_YYYY-MM-DD...enc
    ```

4.  **Verify Data Integrity**:
    Check that `.agent/brain/` and `.agent/companies/` are populated and start the system to verify connectivity to the memory stores.

## Security Hardening

Secure the ecosystem using the **Security Monitor MCP**.

1.  **Enable Security Monitor**:
    Ensure the `security_monitor` MCP server is registered in your `mcp.json`.

2.  **Automated Patching**:
    The Security Monitor continuously scans dependencies for vulnerabilities and can automatically generate and propose pull requests to patch them.

3.  **Anomaly Detection**:
    It monitors API usage and system behavior for anomalous activity, triggering alerts based on configured thresholds.

## Monitoring & Observability

Maintain visibility into the ecosystem's performance and behavior.

1.  **Health Monitor Dashboard**:
    Access the visual web UI built with Vue.js. Run `simple dashboard` or access it via the configured Ingress endpoint (default port `3004`).

2.  **Ecosystem Auditor Logs**:
    The `EcosystemAuditor` MCP server writes non-blocking `.jsonl` logs of all cross-agency communications, morphology adjustments, and policy changes.

3.  **Audit Reports**:
    Use the `generate_ecosystem_audit_report` tool to synthesize these logs into a readable Markdown report, summarizing ecosystem health over a specified timeframe.

## Federation & Collective Intelligence

The Federation Protocol enables Child Agencies to collaborate and learn from each other.

1.  **Task Delegation**:
    Agencies can discover capabilities of other registered agencies via the Distributed Ledger and delegate sub-tasks accordingly.

2.  **Cross-Agency Pattern Recognition**:
    The Root Agency uses the Brain MCP's `cross_agency_pattern_recognition` tool to periodically scan all child namespaces. It identifies recurring successes or failures across the ecosystem.

3.  **Applied Meta-Learning**:
    Insights derived from pattern recognition (`ecosystem_policy`) are automatically applied using the `apply_ecosystem_insights` tool in the `agency_orchestrator`. This dynamically adjusts swarm parameters (e.g., `scaling_threshold`, `max_agents`) for targeted child agencies, creating a continuous optimization loop.

## Scaling Operations

Handle massive demand using the **Hyper-Scaling Engine MCP**.

1.  **Evaluate Massive Demand**:
    The engine continuously monitors incoming requests and queue lengths.

2.  **Simulate & Optimize**:
    Before scaling, it simulates scenarios (`simulate_scaling_scenario`) and optimizes global costs (`optimize_global_costs`) to find the most efficient deployment strategy.

3.  **Enforce Budgets**:
    The `enforce_resource_budget` tool ensures that scaled swarms do not exceed predefined financial or token limits.

## Troubleshooting & FAQs

*   **Child Agency Spawn Fails**:
    *   *Check*: Ensure the requested `resourceLimit` is at least 10 and does not exceed the parent's `token_budget` defined in the `CorporatePolicy`.
    *   *Check*: Verify the target child agency ID is unique.
*   **Restore Script Fails with Decryption Error**:
    *   *Check*: Verify that the `BACKUP_ENCRYPTION_KEY` matches the key used during the backup creation.
*   **High Latency in Cross-Agency Communication**:
    *   *Check*: Review the Ecosystem Auditor logs for excessive retries or network bottlenecks in the Federation Protocol. Ensure nodes are appropriately provisioned.
