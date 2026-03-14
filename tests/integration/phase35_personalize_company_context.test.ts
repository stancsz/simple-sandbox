import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EpisodicMemory } from '../../src/brain/episodic.js';
import * as llmModule from '../../src/llm.js';
import { personalize_company_context } from '../../src/mcp_servers/brain/tools/apply_ecosystem_insights.js';
import { CompanyContextServer } from '../../src/mcp_servers/company_context.js';
import { BrainServer } from '../../src/mcp_servers/brain/index.js';
import * as lancedb from '@lancedb/lancedb';
import fs from 'fs/promises';
import path from 'path';

vi.mock('../../src/llm.js', () => {
    return {
        createLLM: vi.fn(() => ({
            generate: vi.fn().mockResolvedValue('{"actionable_insight": "Use localized caching to save 20% compute costs."}'),
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
        }))
    };
});

// Since we can't easily start the whole system with child processes in a simple test,
// we will test the logic layers and the CompanyContext server directly.
describe('Phase 35: Personalize Company Context Integration', () => {
    let memory: EpisodicMemory;
    let mockLlm: any;
    const testCompanyId = 'test-client-a';
    const testDir = path.join(process.cwd(), '.agent', 'companies', testCompanyId);

    beforeEach(async () => {
        // Setup mock Episodic Memory
        memory = {
            recall: vi.fn().mockResolvedValue([
                { id: '1', type: 'ecosystem_optimization', agentResponse: 'Global pattern: high latency observed, implement edge caching.' }
            ]),
            getRecentEpisodes: vi.fn().mockResolvedValue([
                { id: '1', type: 'ecosystem_optimization', agentResponse: 'Global pattern: high latency observed, implement edge caching.' }
            ])
        } as unknown as EpisodicMemory;

        mockLlm = llmModule.createLLM();

        // Let's create a minimal test context in the DB so the query_company_context call doesn't fail
        const ccServer = new CompanyContextServer();
        const serverInstance: any = (ccServer as any).server;
        let updateTool: any = null;
        if (serverInstance._tools instanceof Map) {
            updateTool = serverInstance._tools.get('update_company_context');
        } else {
            const tools: any = serverInstance._registeredTools || serverInstance.tools || serverInstance._tools || {};
            updateTool = tools['update_company_context'] || Object.values(tools).find((t: any) => t.name === 'update_company_context') as any;
        }
        if (updateTool) {
            await (updateTool.handler || updateTool)({ company_id: testCompanyId, insight_payload: "Test company context: Tech stack is Node.js and AWS." }, {});
        }

        // Clean up test dir
        await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    });

    it('should generate personalized insights via apply_ecosystem_insights logic', async () => {
        const insights = await personalize_company_context(testCompanyId, memory, mockLlm, 'efficiency');
        expect(insights).toContain('actionable_insight');
        expect(memory.getRecentEpisodes).toHaveBeenCalled();
        expect(mockLlm.generate).toHaveBeenCalled();

        const generateCall = mockLlm.generate.mock.calls[0];
        expect(generateCall[1][0].content).toContain(testCompanyId);
        expect(generateCall[1][0].content).toContain('efficiency');
    });

    it('should inject meta-learning insights into Company Context vector database via update_company_context tool', async () => {
        // Instantiate the CompanyContext server (it creates the DB if not exist)
        const ccServer = new CompanyContextServer();

        // Find the tool in the SDK wrapper
        const serverInstance: any = (ccServer as any).server;

        // _tools is a Map in newer MCP SDK versions, let's handle both objects and Maps
        let updateTool: any = null;
        if (serverInstance._tools instanceof Map) {
            updateTool = serverInstance._tools.get('update_company_context');
        } else {
            const tools: any = serverInstance._registeredTools || serverInstance.tools || serverInstance._tools || {};
            updateTool = tools['update_company_context'] || Object.values(tools).find((t: any) => t.name === 'update_company_context') as any;
        }

        if (!updateTool) {
            console.log("Registered tools map keys:", serverInstance._tools ? Array.from(serverInstance._tools.keys()) : "No _tools property");
        }

        expect(updateTool).toBeDefined();

        const payload = '{"actionable_insight": "Use localized caching to save 20% compute costs."}';

        // Call the tool directly
        const result = await (updateTool.handler || updateTool)({ company_id: testCompanyId, insight_payload: payload }, {});

        expect(result.isError).toBeFalsy();
        expect(result.content[0].text).toContain('Successfully injected meta-learning insight');

        // Verify that the DB was actually created and contains the data
        const dbPath = path.join(testDir, 'brain');
        const db = await lancedb.connect(dbPath);
        const tableNames = await db.tableNames();
        expect(tableNames).toContain('documents');

        const table = await db.openTable('documents');
        const rows = await table.query().limit(10).toArray();

        expect(rows.length).toBe(1);
        expect(rows[0].source).toBe('ecosystem_meta_learning');
        expect(rows[0].content).toBe(payload);
        expect((rows[0].id as string).startsWith('meta_insight_')).toBe(true);
    });

    it('should have weekly_context_personalization registered in the scheduler config', async () => {
        const configPath = path.join(process.cwd(), 'src', 'scheduler', 'config.ts');
        const configContent = await fs.readFile(configPath, 'utf-8');
        expect(configContent).toContain('weekly_context_personalization');
        expect(configContent).toContain('personalize_all_company_contexts');
    });
});
