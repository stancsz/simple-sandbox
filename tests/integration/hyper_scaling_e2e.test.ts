import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Deps, evaluateMassiveDemand, optimizeGlobalCosts, enforceResourceBudget } from "../../src/mcp_servers/hyper_scaling_engine/scaling_core.js";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { join } from "path";

// Mock the EpisodicMemory to avoid real DB connections
vi.mock("../../src/brain/episodic.js", () => {
    const EpisodicMemoryMock = vi.fn();
    EpisodicMemoryMock.prototype.recall = vi.fn().mockResolvedValue([
        { id: "client_activity_1", type: "client_activity", timestamp: Date.now(), metadata: {} },
        { id: "client_activity_2", type: "client_activity", timestamp: Date.now(), metadata: {} },
        { id: "client_activity_3", type: "client_activity", timestamp: Date.now(), metadata: {} },
        { id: "client_activity_4", type: "client_activity", timestamp: Date.now(), metadata: {} },
        { id: "client_activity_5", type: "client_activity", timestamp: Date.now(), metadata: {} }
    ]);
    return { EpisodicMemory: EpisodicMemoryMock };
});

// Mock getLatestPolicy from fleet_manager
vi.mock("../../src/swarm/fleet_manager.js", () => {
    return {
        getLatestPolicy: vi.fn().mockResolvedValue({
            parameters: { max_concurrent_swarms: 15 } // Mock policy limit
        })
    };
});

describe("Phase 38: Hyper-Scaling Engine E2E Workflow", () => {
    let memory: EpisodicMemory;

    beforeEach(() => {
        vi.clearAllMocks();
        memory = new EpisodicMemory(join(process.cwd(), ".agent_test_hyper_scaling"));

        // Mock external dependencies via Deps pattern
        vi.spyOn(Deps, "getLinearClient").mockResolvedValue({
            issues: async () => ({ nodes: new Array(1500).fill({}) }) // 1500 tasks total
        } as any);

        vi.spyOn(Deps, "fetchHealthMetrics").mockResolvedValue({
            cpuUsage: 92, // High usage
            memoryUsage: 85,
            activeSwarms: 10
        });

        vi.spyOn(Deps, "fetchBusinessOpsMetrics").mockResolvedValue({
            currentBudget: 500000,
            spendToDate: 450000 // 90% budget used
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should successfully run the E2E workflow: Demand Evaluation -> Budget Enforcement -> Cost Optimization", async () => {
        // Step 1: Demand Evaluation
        // With 1500 issues and 5 active clients, tasks per client = 300. Total volume = 1500.
        // Recommended swarms = ceil(1500 / 50) = 30
        const demand = await evaluateMassiveDemand(memory);

        expect(demand.totalActiveClients).toBe(5);
        expect(demand.projectedTaskVolume).toBe(1500);
        expect(demand.recommendedSwarms).toBe(30);
        // High CPU (92) should trigger at least High risk
        expect(["High", "Critical"]).toContain(demand.bottleneckRisk);

        // Step 2: Budget Enforcement
        // Requested 30 swarms, but mock policy limits max_concurrent_swarms to 15.
        const budgetResult = await enforceResourceBudget(demand.recommendedSwarms);

        expect(budgetResult.budgetExceeded).toBe(true);
        expect(budgetResult.allowedSwarms).toBe(15);
        expect(budgetResult.policyConstraintApplied).toBe("Policy limit: 15 swarms");

        // Step 3: Cost Optimization
        // For 15 swarms but 90% budget used, we expect aggressive savings (spend > 0.8 budget)
        const optimization = await optimizeGlobalCosts(budgetResult.allowedSwarms);

        expect(optimization.estimatedSavingsPercentage).toBe(40);
        expect(optimization.routineModel).toBe("gemini-1.5-flash");
        expect(optimization.routingLogic).toContain("Hyper-scale tiering");
    });
});
