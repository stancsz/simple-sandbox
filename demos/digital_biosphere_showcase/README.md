# 🌍 Production-Grade Digital Biosphere Showcase

The Digital Biosphere Showcase is the culmination of Phases 32–37, demonstrating a fully autonomous, self-evolving agency ecosystem. This end-to-end demonstration showcases the root agency orchestrating a complex project, meta-learning from its execution, adjusting structural topologies, and providing deep observability.

## 🚀 How to Run the Showcase

1. **Prerequisites**: Ensure you have installed the dependencies and built the project (`npm install && npm run build`).
2. **Execute**: Run the following command from the repository root:

```bash
npx tsx demos/digital_biosphere_showcase/run_showcase.ts
```

3. **Observe Results**:
   - Start the Health Monitor dashboard to visualize the real-time topology and audit logs:
     ```bash
     npm run dashboard
     ```
   - Navigate to `http://localhost:3000/ecosystem` in your web browser.

## 🧬 How It Works (Roadmap Mapping)

This single script touches on all the core pillars of the Multi-Agency framework:

- **Phase 32 (Agency Spawning)**: The script begins by spawning specialized child agencies ('frontend', 'backend', 'devops') to handle specific tasks defined in `project_spec.json`.
- **Phase 33 (Multi-Agency Federation)**: Tasks are programmatically assigned to these spawned agencies via the `Scheduler` and `Agency Orchestrator`, creating a federated project environment.
- **Phase 34 & 35 (Meta-Learning & Optimization)**: The root agency's Brain MCP analyzes simulated performance data across the ecosystem, proposes policy updates (e.g., token limit adjustments), and applies them predictively across the active child swarms.
- **Phase 36 (Autonomous Evolution)**: Based on underutilization and inefficiency triggers, the Brain proposes dynamic restructuring via `adjust_ecosystem_morphology` (e.g., merging the 'frontend' and 'backend' agencies into a single 'fullstack' unit).
- **Phase 37 (Ecosystem Observability)**: All spawned events, task assignments, policy updates, and morphological changes are written to the Ecosystem Auditor and are accessible via the Vue Dashboard.

## 📚 Related Documentation

- [Production Deployment Guide](../../docs/PRODUCTION_DEPLOYMENT_GUIDE.md)
- [Ecosystem Intelligence & Meta-Learning](../../docs/PHASE34_ECOSYSTEM_INTELLIGENCE.md)
- [Autonomous Agency Evolution](../../docs/PHASE34_AUTONOMOUS_AGENCY_EVOLUTION.md)
- [Showcase Overview](../../docs/SHOWCASE_DEMO.md)
