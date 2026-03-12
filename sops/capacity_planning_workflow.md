# SOP: Automated Capacity Planning Workflow

**Objective**: Ensure infrastructure (Kubernetes nodes) and logical constraints (LLM token budgets) automatically scale up or down based on data-driven forecasted demand without breaking SLAs or exceeding safe limits.

**Trigger**: Daily via the `Scheduler` or `Ghost Mode` evaluation loops.

## Steps

### Step 1: Metric Ingestion
1. The **Health Monitor** intercepts raw operational metrics (`token_usage`, `api_costs`, `latency`).
2. These metrics are continuously pushed to the **Forecasting MCP** via `record_metric`.

### Step 2: Running the Capacity Planner
1. An agent acting as the Chief Operations Officer triggers the `propose_capacity_adjustment` tool in the `business_ops` MCP.
2. The agent provides the following inputs:
   - `horizon_days`: Set to `30` to analyze the upcoming month.
   - `cpu_threshold`: Set to `0.80` to maintain a 20% safety margin.
   - `yoloMode`: Must be set to `true` if operating under an autonomous C-Suite directive; otherwise, defaults to `false` for human review.

### Step 3: Analysis
1. The Capacity Planner fetches predictions for `token_usage` and `cpu_usage` over the horizon.
2. It evaluates these metrics against:
   - Current active Kubernetes nodes capacity.
   - Current active `token_budget` retrieved from Episodic Memory's `corporate_policy`.

### Step 4: Decision Output
1. The tool outputs an object with three states per metric:
   - `scale_up`: If forecasted metric exceeds current limit. (Action: Increases `token_budget` or recommends adding nodes).
   - `reduce_nodes` / `scale_down`: If forecasted metric is severely under-utilized (e.g. <40%).
   - `maintain`: If capacity is healthy and correctly sized.

### Step 5: Autonomous Execution (`yoloMode = true`)
1. The decisions are saved as an `autonomous_decision` array in `EpisodicMemory`.
2. A new `corporate_policy` is generated with the dynamically adjusted `token_budget` and stored.
3. Node scaling operations (if integrated directly with cluster APIs) are recommended for external infrastructure provisioners or auto-scalers.