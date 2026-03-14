import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateEcosystemAuditReport } from "../../src/mcp_servers/ecosystem_auditor/tools/audit_report.js";
import { EcosystemAuditReport } from "../../src/mcp_servers/ecosystem_auditor/schemas/audit_report.js";
import fs from "fs/promises";
import { join } from "path";
import os from "os";

// Mock the LLM explicitly to prevent real API calls
const mockLLMGenerate = vi.fn();
vi.mock("../../src/llm.js", () => {
  return {
    createLLM: () => ({
      generate: mockLLMGenerate,
      embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
    })
  };
});

describe("Phase 37: Ecosystem Auditor - Generate Audit Report", () => {
  let tempDir: string;
  let oldEnvDir: string | undefined;

  beforeEach(async () => {
    // Setup temporary directory for audit logs
    tempDir = await fs.mkdtemp(join(os.tmpdir(), "jules-audit-tests-"));
    const logsDir = join(tempDir, "audit_logs");
    await fs.mkdir(logsDir, { recursive: true });

    oldEnvDir = process.env.JULES_AGENT_DIR;
    process.env.JULES_AGENT_DIR = tempDir;

    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Restore env var and cleanup temp directory
    if (oldEnvDir !== undefined) {
      process.env.JULES_AGENT_DIR = oldEnvDir;
    } else {
      delete process.env.JULES_AGENT_DIR;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should generate a complete report from simulated logs", async () => {
    // Write some simulated logs
    const logsDir = join(tempDir, "audit_logs");
    const logEntries = [
      { timestamp: Date.now(), event_type: "communication", source: "agencyA", target: "agencyB", message: "Need help with design" },
      { timestamp: Date.now(), event_type: "policy_change", agency: "root", change: "increased autonomy" },
      { timestamp: Date.now(), event_type: "morphology_adjustment", action: "agency_spawn", role: "analyst" }
    ];

    await fs.writeFile(
      join(logsDir, "log-1.jsonl"),
      logEntries.map(e => JSON.stringify(e)).join("\n")
    );

    // Mock LLM response for report generation
    const mockReport: Partial<EcosystemAuditReport> = {
      summary: "Simulated summary of ecosystem health.",
      communication_patterns: [
        { category: "Delegation", description: "Agency A requests design help from Agency B", evidence: [] }
      ],
      policy_evolution: [
        { category: "Autonomy", description: "Root increased autonomy", evidence: [] }
      ],
      morphology_changes: [
        { category: "Spawning", description: "New analyst agency spawned", evidence: [] }
      ],
      anomalies: [],
      recommendations: [
        { action: "Monitor A-B comms", rationale: "High frequency", expected_impact: "Better delegation" }
      ]
    };

    mockLLMGenerate.mockResolvedValueOnce({ raw: JSON.stringify(mockReport) });

    const report = await generateEcosystemAuditReport({ timeframe: "last_24_hours", focus_area: "all" });

    expect(mockLLMGenerate).toHaveBeenCalledTimes(1);
    expect(report.summary).toBe("Simulated summary of ecosystem health.");
    expect(report.raw_events_analyzed).toBe(3);
    expect(report.communication_patterns.length).toBe(1);
    expect(report.communication_patterns[0].description).toContain("Agency A");
    expect(report.policy_evolution.length).toBe(1);
    expect(report.morphology_changes.length).toBe(1);
    expect(report.recommendations.length).toBe(1);
  });

  it("should handle empty log directory gracefully", async () => {
    const report = await generateEcosystemAuditReport({ timeframe: "last_24_hours", focus_area: "all" });

    // LLM should not be called if there are no logs
    expect(mockLLMGenerate).not.toHaveBeenCalled();
    expect(report.summary).toContain("No relevant audit logs found");
    expect(report.raw_events_analyzed).toBe(0);
    expect(report.communication_patterns).toEqual([]);
    expect(report.policy_evolution).toEqual([]);
    expect(report.morphology_changes).toEqual([]);
  });

  it("should correctly filter by focus_area = communications", async () => {
    // Write mixed logs
    const logsDir = join(tempDir, "audit_logs");
    const logEntries = [
      { timestamp: Date.now(), event_type: "communication", source: "agencyA", target: "agencyB" },
      { timestamp: Date.now(), event_type: "policy_change", agency: "root" }
    ];

    await fs.writeFile(
      join(logsDir, "mixed-logs.jsonl"),
      logEntries.map(e => JSON.stringify(e)).join("\n")
    );

    mockLLMGenerate.mockResolvedValueOnce({
      raw: JSON.stringify({
        summary: "Focus on comms",
        communication_patterns: [{ category: "Test", description: "Comm test", evidence: [] }]
      })
    });

    const report = await generateEcosystemAuditReport({ timeframe: "last_7_days", focus_area: "communications" });

    expect(report.raw_events_analyzed).toBe(1); // Should only analyze the 1 communication log
    expect(mockLLMGenerate).toHaveBeenCalledTimes(1);

    // Check that only communication logs were passed to the prompt
    const promptPassed = mockLLMGenerate.mock.calls[0][1][0].content;
    expect(promptPassed).toContain("agencyA");
    expect(promptPassed).not.toContain("policy_change");
  });

  it("should handle invalid JSON in logs gracefully", async () => {
    const logsDir = join(tempDir, "audit_logs");
    await fs.writeFile(
      join(logsDir, "broken-logs.jsonl"),
      '{"valid": true, "event_type": "communication"}\n{invalid_json_here}\n{"also_valid": true, "event_type": "policy_change"}'
    );

    mockLLMGenerate.mockResolvedValueOnce({ raw: JSON.stringify({ summary: "Parsed valid logs" }) });

    const report = await generateEcosystemAuditReport({ timeframe: "last_24_hours", focus_area: "all" });

    expect(report.raw_events_analyzed).toBe(2); // Two valid JSON lines
    expect(mockLLMGenerate).toHaveBeenCalledTimes(1);
  });
});
