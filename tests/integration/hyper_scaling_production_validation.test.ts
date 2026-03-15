import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HyperScalingSimulation } from "../../scripts/validate_hyper_scaling_production.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Mock the Client to avoid real MCP transport connections during unit/integration tests
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
    return {
        Client: vi.fn().mockImplementation(() => {
            return {
                connect: vi.fn().mockResolvedValue(true),
                close: vi.fn().mockResolvedValue(true),
                callTool: vi.fn().mockImplementation(async ({ name, arguments: args }) => {
                    if (name === "simulate_scaling_scenario") {
                        const targetClients = args.targetClients || 100;
                        const tasksPerClient = args.tasksPerClient || 10;
                        const totalVolume = targetClients * tasksPerClient;
                        const recommendedSwarms = Math.ceil(totalVolume / 50) || 1;
                        return {
                            content: [{
                                type: "text",
                                text: JSON.stringify({
                                    targetClients,
                                    projectedCostPerMonth: recommendedSwarms * 1000,
                                    requiredSwarms: recommendedSwarms,
                                    systemHealthPrediction: recommendedSwarms > 100 ? "Degraded" : "Stable"
                                })
                            }]
                        };
                    }

                    if (name === "enforce_resource_budget") {
                        const requestedSwarms = args.requestedSwarms || 1;
                        // Mock policy limit of 200 swarms for the test
                        const maxSwarms = 200;
                        const allowed = Math.min(requestedSwarms, maxSwarms);
                        const exceeded = requestedSwarms > maxSwarms;

                        return {
                            content: [{
                                type: "text",
                                text: JSON.stringify({
                                    allowedSwarms: allowed,
                                    budgetExceeded: exceeded,
                                    policyConstraintApplied: exceeded ? `Policy limit: ${maxSwarms} swarms` : null
                                })
                            }]
                        };
                    }

                    if (name === "optimize_global_costs") {
                        const projectedSwarms = args.projectedSwarms || 1;
                        let savings = 0;
                        let routing = "Default";

                        if (projectedSwarms > 50) {
                            savings = 25;
                            routing = "Strict tiering";
                        }
                        if (projectedSwarms > 150) {
                            savings = 40;
                            routing = "Hyper-scale tiering";
                        }

                        return {
                            content: [{
                                type: "text",
                                text: JSON.stringify({
                                    routineModel: "mock-model",
                                    complexModel: "mock-complex",
                                    estimatedSavingsPercentage: savings,
                                    routingLogic: routing,
                                    financialData: {}
                                })
                            }]
                        };
                    }

                    return {
                        isError: true,
                        content: [{ type: "text", text: `Tool ${name} not mocked` }]
                    };
                })
            };
        })
    };
});

describe("Phase 38: Hyper-Scaling Production Simulation Script Validation", () => {
    let sim: HyperScalingSimulation;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(async () => {
        if (sim) {
            await sim.cleanup();
        }
    });

    it("should run the smoke test simulation without errors and produce valid JSON summary", async () => {
        sim = new HyperScalingSimulation({ clientCount: 10, steps: 5, baseDemandPerClient: 10 });
        await sim.initialize();
        const result = await sim.run();

        expect(result).toBeDefined();
        expect(result.totalSimulatedCost).toBeGreaterThanOrEqual(0);
        expect(result.naiveBaselineCost).toBeGreaterThanOrEqual(0);
        expect(result.costSavingsPercentage).toBeGreaterThanOrEqual(0);
        expect(result.metrics.length).toBe(5); // 5 steps

        // With 10 clients, max swarms is low, so no budget violations expected
        expect(result.budgetViolations).toBe(0);
    });

    it("should run full mode simulation, trigger budget enforcement, and apply cost optimizations", async () => {
        // High client count to trigger massive demand and budget violations
        sim = new HyperScalingSimulation({ clientCount: 500, steps: 10, baseDemandPerClient: 50 });
        await sim.initialize();
        const result = await sim.run();

        expect(result.metrics.length).toBe(10);

        // Assert that budget limits were hit
        expect(result.budgetViolations).toBeGreaterThan(0);

        // Since we pushed high volume, cost optimizations should have triggered savings
        expect(result.costSavingsPercentage).toBeGreaterThan(0);
        expect(result.naiveBaselineCost).toBeGreaterThan(result.totalSimulatedCost);

        // Check that allowedSwarms never exceeded the mocked 200 limit
        for (const metric of result.metrics) {
            expect(metric.allowedSwarms).toBeLessThanOrEqual(200);
        }
    });
});
