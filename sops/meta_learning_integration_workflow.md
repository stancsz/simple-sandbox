# Meta-Learning Integration Workflow

## Purpose
This SOP details the automated workflow where ecosystem-wide meta-learning insights are extracted and injected into individual company contexts. This process ensures that swarms operating on behalf of specific clients benefit from the collective intelligence of the entire Simple-CLI network.

## Triggers
- **Automated Trigger**: The Scheduler (`weekly_context_personalization` task) runs every Sunday at 2:00 PM.
- **Manual Trigger**: Executing the `personalize_all_company_contexts` tool via the Brain MCP or `personalize_company_context` for a specific company.

## Workflow Execution Steps

1. **Global Pattern Retrieval**
   - The Brain MCP server executes `analyze_ecosystem_patterns`.
   - It retrieves episodic memories (`success`, `failure`, `bottleneck`) across all active agency namespaces.

2. **Fleet Discovery**
   - The Brain MCP queries the `business_ops` server via the `get_fleet_status` tool.
   - It identifies all currently active company contexts managed by the root agency.

3. **Insight Personalization (LLM Step)**
   - For each active company, the global patterns are passed to the strategic LLM.
   - The LLM receives the `company_id` and is instructed to filter and reframe the global patterns into actionable directives tailored specifically for that company's operational context.

4. **Context Injection**
   - The Brain MCP connects directly to the Company Context MCP server.
   - It calls the `update_company_context` tool with the personalized JSON/text payload.
   - The Company Context server generates an embedding for the payload and saves it into the company's dedicated LanceDB vector store (`documents` table) with the source tag `ecosystem_meta_learning`.

5. **Recursive Optimization Loop**
   - Subsequent tasks executed by swarms for that company will automatically retrieve these insights via the standard RAG process.
   - For example, if the ecosystem discovered a cost-saving pattern for AWS Lambda usage, the injected context will guide the company's specific swarm to apply that optimization in its upcoming sprint.

## Metrics for Success
- Vector DB injection success rate (tracked via MCP tool output).
- Increased efficiency and cost-savings across individual company operations post-injection (monitored by Business Ops).
