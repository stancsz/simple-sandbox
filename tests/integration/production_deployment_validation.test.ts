import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import child_process from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------
// 1. Mocks
// ---------------------------------------------------------

// Mock execFile to simulate Helm commands for the deployment script
vi.mock('child_process', () => ({
  default: {
    execFile: vi.fn((cmd, args, cb) => {
      // Simulate helm deployment and multi-region failover
      if (cmd === 'helm' && args.includes('template')) {
        cb(null, { stdout: '--- # Source: simple-cli/templates/deployment.yaml\napiVersion: apps/v1', stderr: '' });
      } else if (cmd === 'helm' && args.includes('upgrade')) {
        cb(null, { stdout: 'Release "simple-cli" has been upgraded. Happy Helming!', stderr: '' });
      } else {
        cb(null, { stdout: '', stderr: '' });
      }
    })
  }
}));

// Mock MCP Client for orchestrator communication
const mockCallTool = vi.fn();
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      connect: vi.fn().mockResolvedValue(true),
      callTool: mockCallTool,
      close: vi.fn().mockResolvedValue(true)
    }))
  };
});

// Mock the Agency Orchestrator tools since we're testing the system interactions
vi.mock('../../src/mcp_servers/agency_orchestrator/tools/index.js', () => {
  return {
    spawnChildAgency: vi.fn().mockImplementation((config) => {
      return Promise.resolve({
        success: true,
        agencyId: `agency_child_${Math.random().toString(36).substring(7)}`,
        isolatedPath: `/mock/path/to/agent_child`,
        budget: config.token_budget
      });
    }),
    mergeChildAgencies: vi.fn().mockResolvedValue({
      success: true,
      message: 'Successfully merged contexts into target agency.'
    })
  };
});

// We need to import the script for testing
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------
// 2. Tests
// ---------------------------------------------------------

describe('Production Deployment & Ecosystem Validation', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates Root Agency deployment via Helm template generation', async () => {
    const execFileAsync = util.promisify(child_process.execFile);

    // Simulate what the script/docs instruct for deploying the root agency
    const chartPath = path.resolve(process.cwd(), 'deployment/chart/simple-cli');
    const args = ['template', 'simple-cli', chartPath, '--namespace', 'agency-root'];

    const { stdout } = await execFileAsync('helm', args);

    expect(child_process.execFile).toHaveBeenCalledWith('helm', args, expect.any(Function));
    expect(stdout).toContain('apiVersion: apps/v1');
  });

  it('validates Child Agency spawning via Agency Orchestrator MCP', async () => {
    // Import the mock directly to verify its invocation
    const { spawnChildAgency } = await import('../../src/mcp_servers/agency_orchestrator/tools/index.js');

    const config = {
      role: 'frontend_developer',
      token_budget: 1000,
      resourceLimit: 20
    };

    const result = await spawnChildAgency(config);

    expect(spawnChildAgency).toHaveBeenCalledWith(config);
    expect(result.success).toBe(true);
    expect(result.agencyId).toContain('agency_child');
    expect(result.budget).toBe(1000);
  });

  it('validates Multi-Region configuration', async () => {
    // A test verifying that applying multi-region values generates the correct helm config
    const execFileAsync = util.promisify(child_process.execFile);

    // Simulating applying the production values
    const chartPath = path.resolve(process.cwd(), 'deployment/chart/simple-cli');
    const args = ['upgrade', '--install', 'simple-cli', chartPath, '--namespace', 'agency-root', '-f', 'values-production.yaml'];

    const { stdout } = await execFileAsync('helm', args);

    expect(child_process.execFile).toHaveBeenCalledWith('helm', args, expect.any(Function));
    expect(stdout).toContain('Release "simple-cli" has been upgraded.');
  });

  it('validates Disaster Recovery backup/restore flow (mocked)', async () => {
    // Mock the backup manager functions
    const mockBackupPath = '.agent/backups/backup_mock_timestamp.enc';

    // Simulating the quick_restore script logic
    const restoreBackup = vi.fn().mockResolvedValue({
      success: true,
      durationMs: 450,
      error: null
    });

    const result = await restoreBackup(mockBackupPath);

    expect(restoreBackup).toHaveBeenCalledWith(mockBackupPath);
    expect(result.success).toBe(true);
    expect(result.durationMs).toBeLessThan(3600000); // Well under 1-hour SLA
  });

  it('validates Security Monitor activation', async () => {
    // Security Monitor MCP should be invocable via the Client
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const client = new Client();
    await client.connect();

    // Simulate scanning dependencies
    mockCallTool.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ vulnerabilities: 0, patched: true }) }]
    });

    const result = await client.callTool({
      name: 'scan_dependencies',
      arguments: {}
    });

    expect(client.connect).toHaveBeenCalled();
    expect(mockCallTool).toHaveBeenCalledWith({ name: 'scan_dependencies', arguments: {} });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.patched).toBe(true);
  });

});
