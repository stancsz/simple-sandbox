import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EpisodicMemory } from '../../src/brain/episodic';
import { applyEcosystemInsights } from '../../src/mcp_servers/brain/tools/apply_ecosystem_insights';
import * as patternAnalysis from '../../src/mcp_servers/brain/tools/pattern_analysis';
import * as policyEngine from '../../src/mcp_servers/business_ops/tools/policy_engine';

// Mock EpisodicMemory
vi.mock('../../src/brain/episodic', () => {
    return {
        EpisodicMemory: vi.fn().mockImplementation(() => {
            return {
                store: vi.fn().mockResolvedValue(true)
            };
        })
    };
});

// Mock dependencies
vi.mock('../../src/mcp_servers/brain/tools/pattern_analysis');
vi.mock('../../src/mcp_servers/business_ops/tools/policy_engine');

const mockLLM = {
    generate: vi.fn(),
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
};

describe('Phase 35: Apply Ecosystem Insights Validation', () => {
    let memory: EpisodicMemory;

    beforeEach(() => {
        vi.clearAllMocks();
        memory = new EpisodicMemory('test_dir');
    });

    it('should translate ecosystem insights into parameter updates and apply them', async () => {
        // Mock the insights returned by analyzeEcosystemPatterns
        const mockInsights = {
            summary: "Swarms with high Linear issue volume perform better with 3+ agents.",
            themes: ["High volume issue swarms struggle with 1-2 agents"],
            performance_insights: [],
            bottlenecks: ["Task backlog due to insufficient agents"],
            recommended_global_actions: ["Increase min_agents_per_swarm for high volume"]
        };

        vi.mocked(patternAnalysis.analyzeEcosystemPatterns).mockResolvedValueOnce(mockInsights);

        // Mock the LLM parsing these insights and outputting parameters
        const mockParameterUpdates = {
            parameter_updates: {
                min_agents_per_swarm: 3,
                max_agents_per_swarm: 10
            },
            justification: "Insights indicate that high issue volume requires at least 3 agents to prevent backlogs."
        };

        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify(mockParameterUpdates)
        });

        // Mock the policy engine applying the update
        vi.mocked(policyEngine.updateOperatingPolicyLogic).mockResolvedValueOnce({
            success: true,
            version: 2,
            policy: { id: "policy-2", version: 2, parameters: mockParameterUpdates.parameter_updates } as any
        });

        const result = await applyEcosystemInsights(memory, mockLLM as any, "test_company");

        // Verify analyzeEcosystemPatterns was called
        expect(patternAnalysis.analyzeEcosystemPatterns).toHaveBeenCalledWith(memory, mockLLM);

        // Verify LLM was called to parse the insights
        expect(mockLLM.generate).toHaveBeenCalledTimes(1);

        // Verify policy engine was called with the generated parameters
        expect(policyEngine.updateOperatingPolicyLogic).toHaveBeenCalledWith(
            mockParameterUpdates.parameter_updates,
            mockParameterUpdates.justification,
            expect.anything(),
            "test_company",
            memory
        );

        // Verify action was logged to episodic memory
        expect(memory.store).toHaveBeenCalledWith(
            expect.stringContaining('ecosystem_optimization_'),
            expect.stringContaining(mockParameterUpdates.justification),
            expect.stringContaining('min_agents_per_swarm'),
            [],
            "test_company",
            undefined,
            undefined,
            undefined,
            undefined,
            0,
            0,
            "ecosystem_optimization"
        );

        // Verify the result object
        expect(result.status).toBe("success");
        expect(result.updates_applied.min_agents_per_swarm).toBe(3);
        expect(result.policy_version).toBe(2);
    });

    it('should handle cases where there are no actionable insights', async () => {
        vi.mocked(patternAnalysis.analyzeEcosystemPatterns).mockResolvedValueOnce({
            summary: "No significant patterns.",
            themes: [], // Empty themes
        });

        const result = await applyEcosystemInsights(memory, mockLLM as any);

        expect(result.status).toBe("no_insights");
        expect(mockLLM.generate).not.toHaveBeenCalled();
        expect(policyEngine.updateOperatingPolicyLogic).not.toHaveBeenCalled();
    });

    it('should handle LLM failing to generate parameter updates', async () => {
        vi.mocked(patternAnalysis.analyzeEcosystemPatterns).mockResolvedValueOnce({
            themes: ["Some theme"]
        });

        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify({ justification: "Could not determine parameters" }) // Missing parameter_updates
        });

        const result = await applyEcosystemInsights(memory, mockLLM as any);

        expect(result.status).toBe("no_updates");
        expect(policyEngine.updateOperatingPolicyLogic).not.toHaveBeenCalled();
    });
});