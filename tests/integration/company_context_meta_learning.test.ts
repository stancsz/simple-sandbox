import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { update_company_with_ecosystem_insights } from '../../src/mcp_servers/company_context/tools.js';
import { CompanyManager } from '../../src/company_context/manager.js';
import { EpisodicMemory } from '../../src/brain/episodic.js';

// Mock EpisodicMemory locally
const memoryStore = new Map<string, any[]>();

vi.mock('../../src/brain/episodic.js', () => {
    return {
        EpisodicMemory: class MockEpisodicMemory {
            constructor() {}
            async init() {}
            async getRecentEpisodes(company: string, limit: number) {
                const results = memoryStore.get(company) || [];
                return results.slice(0, limit);
            }
            async recall(query: string, limit: number, company: string, type: string) {
                const all = memoryStore.get(company) || [];
                const filtered = all.filter(e => e.type === type);
                return filtered.slice(0, limit);
            }
            async store(
                taskId: string,
                request: string,
                solution: string,
                artifacts: string[],
                company: string,
                simulation_attempts: string[],
                resolved_via_dreaming: boolean,
                dreaming_outcomes: string,
                id: string,
                tokens: number,
                duration: number,
                type: string
            ) {
                const entry = { taskId, request, agentResponse: solution, solution, type, company, timestamp: Date.now() };
                const companyKey = company || 'default';
                const existing = memoryStore.get(companyKey) || [];
                memoryStore.set(companyKey, [entry, ...existing]);
            }
        }
    };
});

vi.mock('../../src/llm.js', () => {
    return {
        createLLM: () => ({
            embed: async () => new Array(1536).fill(0),
            generate: async (prompt: string) => {
                // Phase 35 LLM Prompt for Company Context Insights
                if (prompt.includes("Ecosystem Optimization Engine")) {
                    if (prompt.includes("industry\":") || prompt.includes("general")) {
                        return { message: JSON.stringify(["Tailored insights generated.", "Personalized Success"]) };
                    } else {
                        return { message: JSON.stringify(["General insights generated.", "General Success"]) };
                    }
                }
                return { message: "[]" };
            }
        })
    };
});

// Mock LanceDB locally to avoid DB errors
vi.mock('@lancedb/lancedb', () => {
    return {
        connect: vi.fn().mockImplementation(async () => {
            return {
                tableNames: vi.fn().mockResolvedValue(["documents"]),
                openTable: vi.fn().mockResolvedValue({
                    add: vi.fn().mockResolvedValue(true)
                }),
                createTable: vi.fn().mockResolvedValue({
                    add: vi.fn().mockResolvedValue(true)
                })
            };
        })
    };
});

describe('Company Context Meta-Learning Integration', () => {
    beforeEach(() => {
        memoryStore.clear();

        // Seed default ecosystem policy to satisfy the new Phase 35 logic
        memoryStore.set('default', [
            {
                type: 'ecosystem_policy',
                solution: JSON.stringify({
                    target_agencies: 'all',
                    parameters: { optimize: true }
                }),
                timestamp: Date.now()
            }
        ]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should fall back to default attributes and generate insights if no attributes exist', async () => {
        const result = await update_company_with_ecosystem_insights('test-company');
        expect(result).toBe('Successfully applied 2 ecosystem insights for company test-company.');

        const memories = memoryStore.get('test-company') || [];

        const profileMemory = memories.find(m => m.type === 'company_profile');
        expect(profileMemory).toBeDefined();
        expect(JSON.parse(profileMemory!.agentResponse)).toEqual({ industry: 'general', size: 'unknown' });

        const insightMemory = memories.find(m => m.type === 'meta_learning_insight');
        expect(insightMemory).toBeDefined();
        expect(insightMemory!.agentResponse).toContain('Tailored insights');
    });

    it('should use existing attributes when generating insights', async () => {
        // Pre-seed an attribute profile
        memoryStore.set('custom-company', [
            {
                type: 'company_profile',
                agentResponse: JSON.stringify({ industry: 'healthcare', size: 'enterprise' })
            }
        ]);

        const result = await update_company_with_ecosystem_insights('custom-company');
        expect(result).toContain('Successfully applied');

        const memories = memoryStore.get('custom-company') || [];
        const insightMemory = memories.find(m => m.type === 'meta_learning_insight');
        expect(insightMemory).toBeDefined();
        // Our mock LLM outputs tailored if JSON is present
        expect(insightMemory!.agentResponse).toContain('Tailored insights');
    });

    it('should include meta-learning insights when loading company context', async () => {
        // Seed meta learning insight
        memoryStore.set('context-company', [
            {
                type: 'meta_learning_insight',
                agentResponse: JSON.stringify({ applied_insights: ["Ecosystem suggests focusing on X."] })
            }
        ]);

        const manager = new CompanyManager('context-company');
        // Hack to bypass config loading logic which tries to read files
        manager['loaded'] = true;
        manager['config'] = { name: 'Context Company', brand_voice: 'Professional' };

        const contextStr = await manager.getContext();

        expect(contextStr).toContain('Company Context: Context Company');
        expect(contextStr).toContain('Meta-Learning Insights');
        expect(contextStr).toContain('Ecosystem suggests focusing on X.');
    });
});
