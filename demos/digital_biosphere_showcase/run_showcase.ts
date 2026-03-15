import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { EpisodicMemory } from '../../src/brain/episodic.js';
import { createLLM } from '../../src/llm.js';
import { spawnChildAgency, createMultiAgencyProject, assignAgencyToTask, applyEcosystemInsights } from '../../src/mcp_servers/agency_orchestrator/tools/index.js';
import { analyzeEcosystemPatterns } from '../../src/mcp_servers/brain/tools/pattern_analysis.js';
import { proposeEcosystemPolicyUpdate } from '../../src/mcp_servers/brain/tools/strategy.js';
import { adjustEcosystemMorphology } from '../../src/mcp_servers/brain/tools/ecosystem_evolution.js';
import { ProjectSpec } from '../../src/mcp_servers/agency_orchestrator/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runDigitalBiosphereShowcase() {
  console.log("\n===================================================================");
  console.log(" 🌍 Digital Biosphere Showcase: Autonomous Agency Ecosystem");
  console.log("===================================================================\n");

  const memory = new EpisodicMemory();
  const llm = createLLM();

  // Step 1: Initialize Project
  console.log("[1] Loading project specification...");
  const projectSpecPath = path.join(__dirname, 'project_spec.json');
  const projectSpecData = await fs.readFile(projectSpecPath, 'utf8');
  const projectSpec: ProjectSpec = JSON.parse(projectSpecData);
  console.log(`    Project: ${projectSpec.name} (${projectSpec.tasks.length} tasks)`);
  await sleep(1000);

  // Step 2: Spawn Child Agencies
  console.log("\n[2] Spawning specialized child agencies for the project...");
  const childAgencies: Record<string, any> = {};

  const rolesToSpawn = ['frontend', 'backend', 'devops'];
  for (const role of rolesToSpawn) {
    const context = `You are a highly specialized ${role} agency dedicated to building the Acme Marketing Platform.`;
    const swarmConfig = {
      concurrency: 2,
      max_agents: 3,
      token_budget: 50000
    };

    const result = await spawnChildAgency(role, context, 1000, swarmConfig, memory);
    childAgencies[role] = result;
    console.log(`    🌱 Spawned [${role}]: ${result.agency_id} (${result.status})`);

    // Explicitly add an "agency_spawning" memory so `applyEcosystemInsights` can find it
    await memory.store(
      `agency_spawning_${result.agency_id}`,
      `Spawned ${role} agency`,
      JSON.stringify(result),
      ["agency_" + result.agency_id, "agency_spawning"],
      "default",
      undefined, undefined, undefined,
      `agency_spawning_${result.agency_id}`,
      undefined, undefined, "autonomous_decision"
    );
  }
  await sleep(1000);

  // Step 3: Assign Tasks to Agencies
  console.log("\n[3] Creating Project and Assigning tasks via the Scheduler...");

  const projectId = await createMultiAgencyProject(projectSpecData, memory);
  console.log(`    📁 Created federated project: ${projectId}`);

  for (const task of projectSpec.tasks) {
    const role = task.required_capabilities?.[0] || 'devops';
    const agencyId = childAgencies[role]?.agency_id;
    if (agencyId) {
      console.log(`    📋 Assigning task '${task.task_id}' to agency ${agencyId}`);
      await assignAgencyToTask(projectId, task.task_id, { agency_id: agencyId, role, initial_context: '', resource_limit: 1000 }, memory);
      console.log(`    ✅ Assigned '${task.task_id}' to ${agencyId}`);
    }
  }
  await sleep(1000);

  // Step 4: Meta-Learning & Policy Update (Phase 34 & 35)
  console.log("\n[4] Triggering Ecosystem Brain: Meta-Learning and Policy Update...");
  console.log("    (Analyzing cross-agency performance and token usage...)");

  // Real call to the Brain's pattern analysis tool
  const analysisObj = await analyzeEcosystemPatterns(memory, llm);

  console.log(`    🧠 Analysis Result: ${analysisObj.analysis.slice(0, 100)}...`);

  console.log("    (Proposing new ecosystem policy based on insights...)");
  const policyUpdateResult = await proposeEcosystemPolicyUpdate(memory, llm, analysisObj);
  console.log(`    📜 Proposed Policy Action: ${policyUpdateResult.action}`);
  if (policyUpdateResult.changes) {
      console.log(`       Changes: ${JSON.stringify(policyUpdateResult.changes)}`);
  }
  await sleep(1000);

  console.log("    (Applying insights globally to child swarms...)");
  const applicationResult = await applyEcosystemInsights(memory);
  console.log(`    ⚙️ Applied policy to ${applicationResult.changes.length} agencies.`);
  for (const change of applicationResult.changes) {
      console.log(`       -> ${change.agency_id}: Updated config to ${JSON.stringify(change.new_config)}`);
  }
  await sleep(1000);

  // Step 5: Dynamic Ecosystem Restructuring (Phase 36)
  console.log("\n[5] Triggering Ecosystem Morphology Adjustment...");
  console.log("    (Simulating a scenario where frontend and backend are better merged into 'fullstack')");

  const mockStatuses = [
    {
      agency_id: childAgencies['frontend'].agency_id,
      role: 'frontend',
      tasks_assigned: 15,
      tasks_failed: 2,
      utilization_rate: 0.9,
      token_efficiency: 0.75,
    },
    {
      agency_id: childAgencies['backend'].agency_id,
      role: 'backend',
      tasks_assigned: 10,
      tasks_failed: 1,
      utilization_rate: 0.85,
      token_efficiency: 0.8,
    },
    {
      agency_id: childAgencies['devops'].agency_id,
      role: 'devops',
      tasks_assigned: 20,
      tasks_failed: 0,
      utilization_rate: 0.95,
      token_efficiency: 0.95,
    }
  ];

  const structuralDecisions = await adjustEcosystemMorphology({ agency_statuses: mockStatuses }, memory);

  console.log("\n==================================================");
  console.log(" 🧬 Ecosystem Evolution Decisions Executed");
  console.log("==================================================");

  if (structuralDecisions.length === 0) {
    console.log("    No morphology changes required.");
  } else {
    for (const decision of structuralDecisions) {
        const icon = decision.action === 'merge' ? '🔗' : decision.action === 'spawn' ? '🌱' : decision.action === 'retire' ? '💀' : '⏸️';
        console.log(`    ${icon} Action: ${decision.action.toUpperCase()}`);
        if (decision.action === 'merge') {
            console.log(`       Targets: ${decision.target_agencies.join(', ')} -> Merge Into: ${decision.config?.merge_into}`);
        } else if (decision.action === 'spawn') {
            console.log(`       New Role: ${decision.config?.role}`);
        } else if (decision.action === 'retire') {
            console.log(`       Targets: ${decision.target_agencies.join(', ')}`);
        }
        console.log(`       Rationale: ${decision.rationale}`);
    }
  }

  // Step 6: Observability Link
  console.log("\n[6] Ecosystem Observability & Dashboard");
  console.log("    The Health Monitor has logged all events, policy updates, and structural changes.");
  console.log("    To visualize the current topology and audit logs in real-time:");
  console.log("\n    👉 Run: npm run dashboard");
  console.log("    👉 Visit: http://localhost:3000/ecosystem");
  console.log("\n===================================================================");
  console.log(" ✅ Showcase Complete");
  console.log("===================================================================\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runDigitalBiosphereShowcase().catch(err => {
      console.error("Showcase encountered an error:", err);
  });
}
