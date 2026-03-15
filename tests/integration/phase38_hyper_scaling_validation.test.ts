import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    evaluateMassiveDemand,
    optimizeGlobalCosts,
    enforceResourceBudget,
    simulateScalingScenario,
    Deps
} from "../../src/mcp_servers/hyper_scaling_engine/scaling_core.js";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { CorporatePolicy } from "../../src/brain/schemas.js";
import * as fleetManager from "../../src/swarm/fleet_manager.js";

vi.mock("../../src/brain/episodic.js", () => {
    return {
        EpisodicMemory: vi.fn().mockImplementation(() => {
            return {
                recall: vi.fn().mockResolvedValue([{ id: "client1" }, { id: "client2" }]),
                store: vi.fn().mockResolvedValue(true)
            };
        })
    };
});

describe("Phase 38: Hyper-Scaling Engine Validation", () => {
    let mockMemory: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockMemory = new EpisodicMemory("");

        // Mock Linear
        vi.spyOn(Deps, "getLinearClient").mockResolvedValue({
            issues: vi.fn().mockResolvedValue({
                nodes: new Array(100).fill({}) // 100 mock issues
            })
        } as any);

        // Mock Health Metrics
        vi.spyOn(Deps, "fetchHealthMetrics").mockResolvedValue({
            cpuUsage: 45,
            memoryUsage: 60,
            activeSwarms: 2
        });

        // Mock Business Ops
        vi.spyOn(Deps, "fetchBusinessOpsMetrics").mockResolvedValue({
            currentBudget: 500000,
            spendToDate: 100000
        });

        // Mock Agency Status
        vi.spyOn(Deps, "fetchAgencyStatus").mockResolvedValue([
            { id: "agency-1", status: "active" }
        ]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("evaluates massive demand by integrating with Linear, Brain, and Health Monitor", async () => {
        // Redefine inside the test to be sure
        vi.spyOn(Deps, "getLinearClient").mockResolvedValue({
            issues: vi.fn().mockResolvedValue({
                nodes: new Array(100).fill({}) // 100 mock issues
            })
        } as any);
        const demand = await evaluateMassiveDemand(mockMemory);

        // Linear: 100 issues. Brain: 2 clients.
        // tasksPerClient = Math.ceil(100 / 2) = 50.
        // Total Volume = 2 * 50 = 100.
        // Recommended Swarms = Math.ceil(100 / 50) = 2.

        expect(demand.totalActiveClients).toBe(2);
        expect(demand.projectedTaskVolume).toBe(100);
        expect(demand.recommendedSwarms).toBe(2);
        expect(demand.bottleneckRisk).toBe("Low");
        expect(demand.metrics.cpuUsage).toBe(45);

        // Test High Demand / High Risk branch
        vi.spyOn(Deps, "getLinearClient").mockResolvedValue({
            issues: vi.fn().mockResolvedValue({
                nodes: new Array(3000).fill({})
            })
        } as any);

        const demandHigh = await evaluateMassiveDemand(mockMemory);
        expect(demandHigh.projectedTaskVolume).toBe(3000);
        expect(demandHigh.recommendedSwarms).toBe(60);
        expect(demandHigh.bottleneckRisk).toBe("High");
    });

    it("optimizes global costs based on swarm projections and financial data", async () => {
        const optLow = await optimizeGlobalCosts(20);
        expect(optLow.routineModel).toBe("gpt-4o-mini");
        expect(optLow.estimatedSavingsPercentage).toBe(0);

        // Test Business Ops budget trigger (90% spend)
        vi.spyOn(Deps, "fetchBusinessOpsMetrics").mockResolvedValue({
            currentBudget: 500000,
            spendToDate: 450000 // > 80%
        });

        const optMid = await optimizeGlobalCosts(20);
        expect(optMid.routineModel).toBe("gemini-1.5-flash");
        expect(optMid.estimatedSavingsPercentage).toBe(40);

        // Test swarm projection trigger
        vi.spyOn(Deps, "fetchBusinessOpsMetrics").mockResolvedValue({
            currentBudget: 500000,
            spendToDate: 100000
        });

        const optHyper = await optimizeGlobalCosts(200);
        expect(optHyper.routineModel).toBe("gemini-1.5-flash");
        expect(optHyper.estimatedSavingsPercentage).toBe(40);
    });

    it("enforces resource budget via mock policy limits", async () => {
        vi.spyOn(fleetManager, "getLatestPolicy").mockResolvedValueOnce({
            id: "policy-1",
            version: 1,
            name: "Strict Scaling Policy",
            description: "Test policy",
            parameters: {
                min_margin: 0.2,
                risk_tolerance: "low",
                max_agents_per_swarm: 5,
                max_concurrent_swarms: 50
            },
            isActive: true,
            timestamp: Date.now(),
            author: "Admin"
        } as CorporatePolicy);

        const budgetResultExceeded = await enforceResourceBudget(100, "test-company");
        expect(budgetResultExceeded.allowedSwarms).toBe(50);
        expect(budgetResultExceeded.budgetExceeded).toBe(true);
        expect(budgetResultExceeded.policyConstraintApplied).toBe("Policy limit: 50 swarms");

        vi.spyOn(fleetManager, "getLatestPolicy").mockResolvedValueOnce({
            id: "policy-2",
            version: 1,
            name: "Strict Scaling Policy",
            description: "Test policy",
            parameters: {
                min_margin: 0.2,
                risk_tolerance: "low",
                max_agents_per_swarm: 5,
                max_concurrent_swarms: 50
            },
            isActive: true,
            timestamp: Date.now(),
            author: "Admin"
        } as CorporatePolicy);

        const budgetResultAllowed = await enforceResourceBudget(20, "test-company");
        expect(budgetResultAllowed.allowedSwarms).toBe(20);
        expect(budgetResultAllowed.budgetExceeded).toBe(false);
    });

    it("simulates scaling scenario to predict costs and health", async () => {
        const simulation = await simulateScalingScenario(500, 10);
        expect(simulation.requiredSwarms).toBe(100);
        expect(simulation.projectedCostPerMonth).toBe(75000);
        expect(simulation.systemHealthPrediction).toBe("Stable");

        const extremeSim = await simulateScalingScenario(1000, 20);
        expect(extremeSim.requiredSwarms).toBe(400);
        expect(extremeSim.projectedCostPerMonth).toBe(240000);
        expect(extremeSim.systemHealthPrediction).toBe("Degraded response times likely");
    });
});
