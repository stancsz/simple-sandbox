import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runDigitalBiosphereShowcase } from '../../demos/digital_biosphere_showcase/run_showcase.js';
import * as llmModule from '../../src/llm.js';
import * as path from 'path';

// Mock EpisodicMemory
vi.mock('../../src/brain/episodic.js', () => {
    const memoryStore: Record<string, any[]> = {};
    return {
        EpisodicMemory: vi.fn().mockImplementation(() => ({
            store: vi.fn().mockImplementation(async (id, req, sol, tags, ns, ...args) => {
                const topic = typeof id === 'string' && id.startsWith('ecosystem_policy') ? 'ecosystem_policy' : (tags?.find((t: string) => t.startsWith('agency_')) || 'default');
                if (!memoryStore[topic]) memoryStore[topic] = [];
                memoryStore[topic].push({ id, solution: sol, tags });
                return true;
            }),
            recall: vi.fn().mockImplementation(async (topic) => {
                if (topic === 'ecosystem_policy') {
                    // For apply_ecosystem_insights
                    return [{ solution: JSON.stringify({ target_agencies: 'all', parameters: { token_budget: 100000 } }) }];
                }
                if (topic === 'agency_spawning') {
                    return Object.values(memoryStore).flat().filter(m => m.tags?.includes('agency_spawning'));
                }
                if (typeof topic === 'string' && topic.startsWith('swarm_config:')) {
                    return [{ id: topic, solution: JSON.stringify({ concurrency: 2 }) }];
                }
                return [];
            })
        }))
    };
});

// Mock Tools
vi.mock('../../src/mcp_servers/agency_orchestrator/tools/index.js', () => ({
    spawnChildAgency: vi.fn().mockImplementation(async (role) => ({
        agency_id: `child-${role}-123`,
        status: 'active',
        role
    })),
    createMultiAgencyProject: vi.fn().mockResolvedValue('proj-12345'),
    assignAgencyToTask: vi.fn().mockResolvedValue(true),
    applyEcosystemInsights: vi.fn().mockResolvedValue({
        status: 'success',
        changes: [{ agency_id: 'child-frontend-123', new_config: { token_budget: 100000 } }]
    })
}));

vi.mock('../../src/mcp_servers/brain/tools/pattern_analysis.js', () => ({
    analyzeEcosystemPatterns: vi.fn().mockResolvedValue({ analysis: 'mocked insights' })
}));

vi.mock('../../src/mcp_servers/brain/tools/strategy.js', () => ({
    proposeEcosystemPolicyUpdate: vi.fn().mockResolvedValue({
        action: 'increase_token_budget_global',
        changes: { token_budget: 100000 }
    })
}));

vi.mock('../../src/mcp_servers/brain/tools/ecosystem_evolution.js', () => ({
    adjustEcosystemMorphology: vi.fn().mockResolvedValue([
        {
            action: 'merge',
            target_agencies: ['child-frontend-123', 'child-backend-123'],
            rationale: 'Merging to improve cross-disciplinary tasks.',
            config: { merge_into: 'child-fullstack-1' }
        }
    ])
}));

describe('Digital Biosphere Showcase Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should run showcase and output expected ecosystem lifecycle actions', async () => {
        // Mock LLM
        vi.spyOn(llmModule, 'createLLM').mockReturnValue({
            generate: vi.fn().mockResolvedValue({
                raw: JSON.stringify({ target_agencies: 'all', parameters: { token_budget: 100000 } })
            }),
            embed: vi.fn()
        } as any);

        const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(runDigitalBiosphereShowcase()).resolves.not.toThrow();

        // Verify script orchestration output
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Digital Biosphere Showcase'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Spawned [frontend]'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Spawned [backend]'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Assigning task'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Ecosystem Brain: Meta-Learning and Policy Update'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Ecosystem Morphology Adjustment'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('MERGE'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Targets: child-frontend-123, child-backend-123'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Observability & Dashboard'));
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Showcase Complete'));

        consoleLogSpy.mockRestore();
    }, 15000); // Give it a bit more time for the sleep statements
});
