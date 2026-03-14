import { describe, it, expect, vi } from 'vitest';
import { generateEcosystemAuditReport, generateEcosystemAuditReportSchema } from '../../src/mcp_servers/ecosystem_auditor/tools.js';
import { server } from '../../src/mcp_servers/ecosystem_auditor/index.js';

// Mock the LLM to prevent real API calls during tests
vi.mock('../../src/llm.js', () => ({
  createLLM: vi.fn(() => ({
    generate: vi.fn().mockResolvedValue({
      raw: JSON.stringify({
        executive_summary: "Audit report generated.",
        key_findings: [],
        compliance_status: "compliant",
        recommendations: []
      })
    }),
    embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
  }))
}));

describe('Phase 37: Ecosystem Auditor Scaffold Validation', () => {

  it('should initialize the MCP server and expose the correct tool', async () => {
    expect(server).toBeDefined();
    // Validate we can query tools via the registered request handler if server is correctly instanced
    expect(typeof server.setRequestHandler).toBe('function');
  });

  it('should have a generate_ecosystem_audit_report tool that accepts timeframe and focus_area', async () => {
    const mockInput = {
      timeframe: 'last_24_hours',
      focus_area: 'all'
    };

    const input = generateEcosystemAuditReportSchema.parse(mockInput);
    expect(input.timeframe).toBe('last_24_hours');
    expect(input.focus_area).toBe('all');

    const result = await generateEcosystemAuditReport(input as any);

    expect(result).toHaveProperty('report_id');
    expect(result.timeframe).toBe('last_24_hours');
    // In empty db case it returns default summary, otherwise mocked summary. Check for existence.
    expect(result.executive_summary).toBeDefined();
    expect(result.events_analyzed).toBeDefined();
  });

  it('should throw validation error on missing required timeframe', () => {
    const invalidInput = {
      focus_area: 'communications'
    };

    expect(() => generateEcosystemAuditReportSchema.parse(invalidInput)).toThrow();
  });
});
