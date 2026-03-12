import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EpisodicMemory } from '../../src/brain/episodic.js';
import { MCP } from '../../src/mcp.js';
import { makeStrategicDecisionLogic } from '../../src/mcp_servers/brain/tools/strategic_decisions.js';
import { executeStrategicInitiativeLogic } from '../../src/mcp_servers/business_ops/tools/executive_actions.js';

// Mock MCP to avoid actual server spawning
vi.mock('../../src/mcp.js', () => ({
    MCP: vi.fn().mockImplementation(() => ({
        init: vi.fn().mockResolvedValue(undefined),
        getTools: vi.fn().mockResolvedValue([
            {
                name: 'read_strategy',
                execute: vi.fn().mockResolvedValue({ content: [{ text: JSON.stringify({ vision: "Test Vision", objectives: ["Test Obj"] }) }] })
            },
            {
                name: 'analyze_performance_metrics',
                execute: vi.fn().mockResolvedValue({ content: [{ text: JSON.stringify({ cpu_usage: 85 }) }] })
            },
            {
                name: 'get_fleet_status',
                execute: vi.fn().mockResolvedValue({ content: [{ text: JSON.stringify([{ id: 'node1', status: 'active' }]) }] })
            }
        ]),
        callTool: vi.fn().mockImplementation(async (server, tool, args) => {
            if (tool === 'evaluate_policy') {
                return { content: [{ text: JSON.stringify({ is_compliant: true, allowed: true }) }] };
            }
            if (tool === 'get_policy') {
                return { content: [{ text: JSON.stringify({ max_fleet_size: 5, base_pricing_multiplier: 1.0 }) }] };
            }
            if (tool === 'update_policy') {
                return { content: [{ text: JSON.stringify({ success: true, updated_keys: Object.keys(args.updates) }) }] };
            }
            if (tool === 'create_issue') {
                return { content: [{ text: JSON.stringify({ issue_id: `ISSUE-${Math.floor(Math.random() * 1000)}`, url: "https://linear.app/issue" }) }] };
            }
            return { content: [{ text: "{}" }] };
        })
    }))
}));

// Mock LLM
vi.mock('../../src/llm.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        createLLM: vi.fn().mockImplementation(() => ({
            generate: vi.fn().mockResolvedValue({ message: "{}" }),
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
        })),
        createLLMInstance: vi.fn().mockImplementation(() => ({
            generate: vi.fn().mockResolvedValue({ message: "{}" }),
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
        })),
        LLM: class {
            async generate() { return { message: "{}" }; }
            async embed() { return new Array(1536).fill(0.1); }
            async validateEmbedding() { return true; }
            on() {}
            emit() {}
            removeListener() {}
        }
    };
});

// Mock strategy functions
vi.mock('../../src/mcp_servers/brain/tools/strategy.js', () => ({
    readStrategy: vi.fn().mockResolvedValue({
        vision: "Test Vision",
        objectives: ["Objective 1", "Objective 2"],
        policies: { key: "value" },
        timestamp: Date.now()
    }),
    proposeStrategicPivot: vi.fn().mockResolvedValue({
        vision: "New Vision",
        objectives: ["New Objective"],
        policies: { new_key: "new_value" },
        timestamp: Date.now()
    })
}));


vi.mock('../../src/mcp_servers/business_ops/linear_service.js', () => ({
    createProject: vi.fn().mockResolvedValue({ id: 'proj_123' }),
    createIssue: vi.fn().mockResolvedValue({ url: 'https://linear.app/issue/123', identifier: 'ISSUE-123' })
}));

describe('Phase 30: Autonomous Strategic Decision Making Validation', () => {
    let memory: EpisodicMemory;
    let mcp: MCP;
    const company = "phase30_test_corp";

    beforeEach(async () => {
        vi.clearAllMocks();
        memory = new EpisodicMemory();
        await memory.init();

        mcp = new MCP();
        await mcp.init();
    });

    afterEach(async () => {
        // Cleanup memory if needed
    });

    it('skeleton test', () => {
        expect(true).toBe(true);
    });

    it('Scenario 1: Resource Shortage Forecast -> Triggers capacity expansion', async () => {
        // Mock the LLM specifically for this test
        const llmModule = await import('../../src/llm.js');
        const mockGenerate = vi.fn().mockResolvedValueOnce({
            // Response for make_strategic_decision
            message: JSON.stringify({
                decision: "Expand cloud capacity immediately due to predicted CPU shortage.",
                rationale: "Forecast shows a 95% probability of exceeding current CPU limits within 3 days. We must act proactively.",
                confidence_score: 0.92,
                proposed_pivot: "Increase target cloud capacity by 50% across active regions."
            })
        }).mockResolvedValueOnce({
            // Response for execute_strategic_initiative
            message: JSON.stringify({
                policy_updates: {
                    max_fleet_size: 15, // increased from 5
                    auto_scaling_enabled: true
                },
                justification: "Expanding capacity to handle forecasted resource shortage."
            })
        }).mockResolvedValueOnce({
            // Response for generateStrategicInitiativesLogic
            message: JSON.stringify({
                initiatives: [
                    {
                        title: "[Auto-Generated] Capacity Expansion Initiative",
                        description: "Expand max fleet size to 15 to handle predicted load.",
                        priority: "high"
                    }
                ]
            })
        });

        vi.mocked(llmModule.createLLM).mockImplementation(() => ({
            generate: mockGenerate,
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
        } as any));

        const forecastData = JSON.stringify({
            metric: "cpu_usage",
            predicted_value: 98.5,
            threshold: 80.0,
            confidence: 0.95,
            horizon_days: 3
        });

        // 1. Trigger the decision engine
        const decisionResult = await makeStrategicDecisionLogic(memory, forecastData, company);

        expect(decisionResult).toBeDefined();
        expect(decisionResult.analysis.confidence_score).toBeGreaterThan(0.8);
        expect(decisionResult.pivot_applied).toBe(true);

        // 2. Execute the initiative
        const executionResult = await executeStrategicInitiativeLogic(mcp, JSON.stringify(decisionResult.analysis), company);

        expect(executionResult).toBeDefined();
        expect(executionResult.policy_updates.max_fleet_size).toBe(15);
        expect(executionResult.policy_update_result).toBeDefined();
        expect(executionResult.initiatives_result.initiatives_created.length).toBeGreaterThan(0);
        expect(executionResult.initiatives_result.initiatives_created[0].title).toBe("[Auto-Generated] Capacity Expansion Initiative");
    });

    it('Scenario 2: Market Opportunity Forecast -> Triggers pricing/service offering adjustment', async () => {
        const llmModule = await import('../../src/llm.js');
        const mockGenerate = vi.fn().mockResolvedValueOnce({
            message: JSON.stringify({
                decision: "Increase premium service pricing by 15%.",
                rationale: "Forecast shows a sustained 120% increase in market demand for premium AI consulting. We should capture this margin.",
                confidence_score: 0.88,
                proposed_pivot: "Shift focus to high-margin premium AI consulting services."
            })
        }).mockResolvedValueOnce({
            message: JSON.stringify({
                policy_updates: {
                    base_pricing_multiplier: 1.15,
                    focus_tier: "premium"
                },
                justification: "Capturing higher margins based on market opportunity forecast."
            })
        }).mockResolvedValueOnce({
            message: JSON.stringify({
                initiatives: [
                    {
                        title: "[Auto-Generated] Update Marketing for Premium Services",
                        description: "Adjust marketing copy to reflect new premium positioning.",
                        priority: 2
                    }
                ]
            })
        });

        vi.mocked(llmModule.createLLM).mockImplementation(() => ({
            generate: mockGenerate,
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
        } as any));

        const forecastData = JSON.stringify({
            metric: "market_demand_premium",
            predicted_value: 220.0,
            threshold: 150.0,
            confidence: 0.90,
            horizon_days: 14
        });

        // 1. Trigger the decision engine
        const decisionResult = await makeStrategicDecisionLogic(memory, forecastData, company);

        expect(decisionResult).toBeDefined();
        expect(decisionResult.analysis.confidence_score).toBeGreaterThan(0.8);
        expect(decisionResult.pivot_applied).toBe(true);
        expect(decisionResult.analysis.decision).toContain("premium service pricing");

        // 2. Execute the initiative
        const executionResult = await executeStrategicInitiativeLogic(mcp, JSON.stringify(decisionResult.analysis), company);

        expect(executionResult).toBeDefined();
        expect(executionResult.policy_updates.base_pricing_multiplier).toBe(1.15);
        expect(executionResult.initiatives_result.initiatives_created.length).toBeGreaterThan(0);
        expect(executionResult.initiatives_result.initiatives_created[0].title).toBe("[Auto-Generated] Update Marketing for Premium Services");
    });

    it('Scenario 3: Conflicting/Unclear Forecast -> Results in low confidence score, no automatic pivot', async () => {
        const llmModule = await import('../../src/llm.js');
        const mockGenerate = vi.fn().mockResolvedValueOnce({
            message: JSON.stringify({
                decision: "Maintain current course. Collect more data.",
                rationale: "Forecast shows mixed signals regarding market demand, and error margins are too high to justify a definitive strategic pivot.",
                confidence_score: 0.45,
                proposed_pivot: null
            })
        });

        vi.mocked(llmModule.createLLM).mockImplementation(() => ({
            generate: mockGenerate,
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
        } as any));

        const forecastData = JSON.stringify({
            metric: "market_demand_mixed",
            predicted_value: 105.0,
            threshold: 100.0,
            confidence: 0.50, // Low confidence in forecast
            horizon_days: 7,
            error_margin: 0.4
        });

        // 1. Trigger the decision engine
        const decisionResult = await makeStrategicDecisionLogic(memory, forecastData, company);

        expect(decisionResult).toBeDefined();
        expect(decisionResult.analysis.confidence_score).toBeLessThan(0.8);
        expect(decisionResult.pivot_applied).toBe(false);
        expect(decisionResult.updated_strategy).toBe(null);
    });

});
