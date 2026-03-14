import { join } from "path";
import fs from "fs/promises";
import { GenerateEcosystemAuditReportInput, EcosystemAuditReport } from "../schemas/audit_report.js";
import { createLLM } from "../../../llm.js";

/**
 * Helper to get the audit logs directory path.
 */
function getAuditLogsDirectory(): string {
  return process.env.JULES_AGENT_DIR
    ? join(process.env.JULES_AGENT_DIR, "audit_logs")
    : join(process.cwd(), ".agent", "audit_logs");
}

/**
 * Helper to fetch raw logs from the audit logs directory.
 * In a real scenario, this would filter by timeframe.
 */
async function fetchAuditLogs(timeframe: string): Promise<any[]> {
  const logsDir = getAuditLogsDirectory();
  try {
    const files = await fs.readdir(logsDir);
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

    let allLogs: any[] = [];

    for (const file of jsonlFiles) {
      const content = await fs.readFile(join(logsDir, file), "utf-8");
      const lines = content.split('\n').filter(line => line.trim() !== '');
      for (const line of lines) {
        try {
          allLogs.push(JSON.parse(line));
        } catch (e) {
          // ignore parsing errors
        }
      }
    }

    // Simplistic timeframe filtering: for now, we just return all logs or a limited set
    return allLogs;
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      // No logs directory exists yet
      return [];
    }
    throw error;
  }
}

/**
 * Generates an ecosystem audit report based on cross-agency logs and metrics.
 * Uses an LLM to synthesize logs into actionable insights and recommendations.
 *
 * @param {GenerateEcosystemAuditReportInput} input - The input parameters containing timeframe and focus area.
 * @returns {Promise<EcosystemAuditReport>} A promise resolving to the generated audit report.
 */
export async function generateEcosystemAuditReport(input: GenerateEcosystemAuditReportInput): Promise<EcosystemAuditReport> {
  const llm = createLLM();
  const rawLogs = await fetchAuditLogs(input.timeframe);

  // Filter logs if focus_area is specific
  let filteredLogs = rawLogs;
  if (input.focus_area !== "all") {
    filteredLogs = rawLogs.filter(log => {
      // Map focus area to typical event types or logic
      if (input.focus_area === "communications") return log.event_type?.includes("communication") || log.event_type?.includes("message");
      if (input.focus_area === "policy_changes") return log.event_type?.includes("policy");
      if (input.focus_area === "morphology_adjustments") return log.event_type?.includes("morphology") || log.event_type?.includes("agency_spawn") || log.event_type?.includes("agency_merge");
      return true;
    });
  }

  // Cap logs if there are too many (e.g. 1000 logs max for context)
  if (filteredLogs.length > 1000) {
    filteredLogs = filteredLogs.slice(-1000);
  }

  if (filteredLogs.length === 0) {
    return {
      report_id: `audit-${Date.now()}`,
      timeframe: input.timeframe,
      focus_area: input.focus_area,
      summary: `No relevant audit logs found for the specified timeframe (${input.timeframe}) and focus area (${input.focus_area}).`,
      communication_patterns: [],
      policy_evolution: [],
      morphology_changes: [],
      anomalies: [],
      recommendations: [],
      raw_events_analyzed: 0
    };
  }

  const systemPrompt = `You are the Ecosystem Auditor for an autonomous multi-agency ecosystem.
Your task is to analyze the provided audit logs and synthesize a comprehensive report.

Identify patterns in cross-agency communications (e.g., frequency, task delegation), policy changes (e.g., evolution of rules, impacts on autonomy), and morphology adjustments (e.g., why agencies were spawned or merged).
Point out any anomalies or unexpected behaviors.
Provide actionable recommendations to improve the ecosystem's performance, stability, or efficiency.

Output the report STRICTLY as a JSON object matching this TypeScript interface:
{
  "summary": "High-level summary of the ecosystem's behavior",
  "communication_patterns": [{ "category": "Delegation", "description": "Agency A frequently delegates to B", "evidence": ["log_id_1"] }],
  "policy_evolution": [{ "category": "Autonomy", "description": "Increased autonomy by 40%", "evidence": ["log_id_2"] }],
  "morphology_changes": [{ "category": "Spawning", "description": "Spawned Agency C for visual tasks", "evidence": ["log_id_3"] }],
  "anomalies": [{ "category": "Spike", "description": "Unexpected spike in cross-agency messages", "evidence": [] }],
  "recommendations": [{ "action": "Merge A and B", "rationale": "High communication overhead", "expected_impact": "Reduced latency" }]
}`;

  const prompt = `Timeframe: ${input.timeframe}
Focus Area: ${input.focus_area}

Audit Logs:
${JSON.stringify(filteredLogs, null, 2)}`;

  let llmResponseText = "";
  try {
    const response = await llm.generate(systemPrompt, [{ role: "user", content: prompt }]);
    llmResponseText = response.raw;

    // Cleanup backticks if any
    llmResponseText = llmResponseText.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();

    const parsedData = JSON.parse(llmResponseText);

    return {
      report_id: `audit-${Date.now()}`,
      timeframe: input.timeframe,
      focus_area: input.focus_area,
      summary: parsedData.summary || "Summary generated successfully.",
      communication_patterns: parsedData.communication_patterns || [],
      policy_evolution: parsedData.policy_evolution || [],
      morphology_changes: parsedData.morphology_changes || [],
      anomalies: parsedData.anomalies || [],
      recommendations: parsedData.recommendations || [],
      raw_events_analyzed: filteredLogs.length
    };
  } catch (error) {
    console.error("Failed to generate audit report via LLM:", error, "LLM Output:", llmResponseText);
    throw new Error(`Failed to synthesize audit report: ${(error as any).message}`);
  }
}
