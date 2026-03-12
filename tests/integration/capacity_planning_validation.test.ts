import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCapacityPlanningTools } from "../../src/mcp_servers/business_ops/tools/capacity_planning.js";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import k8s from "@kubernetes/client-node";

// Mock the EpisodicMemory class to intercept store and recall methods
vi.mock("../../src/brain/episodic.js", () => {
    return {
        EpisodicMemory: class MockEpisodicMemory {
            async recall(query: string, limit: number, company: string, type: string) {
                if (type === "corporate_policy") {
                    return [{
                        id: "mock-policy-1",
                        agentResponse: JSON.stringify({
                            id: "mock-policy-1",
                            version: 1,
                            isActive: true,
                            parameters: {
                                min_margin: 0.2,
                                token_budget: 1000000 // default mock budget
                            }
                        })
                    }];
                }
                return [];
            }
            async store() {
                // Mock storage
            }
        }
    };
});

// Mock K8s API
vi.mock("@kubernetes/client-node", () => {
    return {
        KubeConfig: class MockKubeConfig {
            loadFromDefault() {}
            makeApiClient() {
                return {
                    listNode: async () => ({
                        body: {
                            items: [
                                { status: { capacity: { cpu: "4", memory: "16333912Ki" } } },
                                { status: { capacity: { cpu: "4", memory: "16333912Ki" } } },
                                { status: { capacity: { cpu: "4", memory: "16333912Ki" } } }
                            ]
                        }
                    })
                };
            }
        },
        CoreV1Api: class {}
    };
});

// Mock the Forecasting Client
let mockForecastMax = 500000;
let mockCpuMax = 5;
let mockMemoryMax = 8000000;

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
    return {
        Client: class MockClient {
            async connect() {}
            async close() {}
            async callTool(params: { name: string, arguments: any }) {
                if (params.name === "forecast_metric") {
                    if (params.arguments.metric_name === "token_usage") {
                         return {
                             content: [{
                                 text: JSON.stringify({ forecast: [{ predicted_value: mockForecastMax }] })
                             }],
                             isError: false
                         };
                    } else if (params.arguments.metric_name === "cpu_usage") {
                         return {
                             content: [{
                                 text: JSON.stringify({ forecast: [{ predicted_value: mockCpuMax }] })
                             }],
                             isError: false
                         };
                    } else if (params.arguments.metric_name === "memory_usage") {
                         return {
                             content: [{
                                 text: JSON.stringify({ forecast: [{ predicted_value: mockMemoryMax }] })
                             }],
                             isError: false
                         };
                    }
                }
                return { isError: true, content: [{ text: "Error" }] };
            }
        }
    };
});

let mockLlmResponse = "[]";
vi.mock("../../src/llm.js", () => {
    return {
        createLLM: vi.fn().mockImplementation(() => ({
            generate: vi.fn().mockImplementation(async () => {
                return { message: mockLlmResponse };
            })
        }))
    };
});

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => {
    return {
        StdioClientTransport: class MockTransport {}
    };
});

describe("Phase 29: Capacity Planning Validation", () => {
    let server: McpServer;

    beforeEach(() => {
        server = new McpServer({ name: "test-server", version: "1.0.0" });
        registerCapacityPlanningTools(server);
    });

    it("should initialize the capacity planning tool", () => {
        const tools = (server as any)._registeredTools || (server as any).registeredTools || (server as any).tools;
        expect(tools).toHaveProperty("propose_capacity_adjustment");
    });

    it("should maintain capacity when usage is within healthy bounds", async () => {
        mockForecastMax = 500000; // < 1m
        mockCpuMax = 5; // < 12 * 0.8 (9.6)

        mockLlmResponse = JSON.stringify([
            { metric: "token_budget", action: "maintain", message: "Token budget is sufficient." },
            { metric: "cpu_usage", action: "maintain", message: "CPU is sufficient." }
        ]);

        const tools = (server as any)._registeredTools || (server as any).registeredTools || (server as any).tools;
        const result = await tools.propose_capacity_adjustment.handler({
            horizon_days: 30,
            cpu_threshold: 0.8,
            memory_threshold: 0.8,
            company: "test",
            yoloMode: false
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.status).toBe("success");
        expect(parsed.capacity.k8sCpu).toBe(12);

        const recs = parsed.recommendations.join(" ");
        expect(recs).toContain("maintain: Token budget is sufficient.");
        expect(recs).toContain("maintain: CPU is sufficient.");
        expect(parsed.executed_actions).toContain("Dry run mode");
    });

    it("should propose scaling up K8s nodes on CPU over-utilization", async () => {
        mockForecastMax = 500000;
        mockCpuMax = 10; // > 12 * 0.8 (9.6)

        mockLlmResponse = JSON.stringify([
            { metric: "cpu_usage", action: "scale_up_nodes", message: "CPU usage exceeds threshold." }
        ]);

        const tools = (server as any)._registeredTools || (server as any).registeredTools || (server as any).tools;
        const result = await tools.propose_capacity_adjustment.handler({
            horizon_days: 30,
            cpu_threshold: 0.8,
            memory_threshold: 0.8,
            company: "test",
            yoloMode: false
        });

        const parsed = JSON.parse(result.content[0].text);
        const recs = parsed.recommendations.join(" ");
        expect(recs).toContain("scale_up_nodes: CPU usage exceeds threshold.");
    });

    it("should propose policy update when token budget is exceeded", async () => {
        mockForecastMax = 1500000; // > 1,000,000
        mockCpuMax = 5;

        mockLlmResponse = JSON.stringify([
            { metric: "token_budget", action: "scale_up", message: "Forecast exceeds current budget.", proposed_value: 1800000 }
        ]);

        const tools = (server as any)._registeredTools || (server as any).registeredTools || (server as any).tools;
        const result = await tools.propose_capacity_adjustment.handler({
            horizon_days: 30,
            cpu_threshold: 0.8,
            memory_threshold: 0.8,
            company: "test",
            yoloMode: false
        });

        const parsed = JSON.parse(result.content[0].text);
        const recs = parsed.recommendations.join(" ");
        expect(recs).toContain("scale_up: Forecast exceeds current budget.");
    });

    it("should propose cost-saving reductions on under-utilization", async () => {
        mockForecastMax = 100000; // < 400,000 (40%)
        mockCpuMax = 2; // < 4.8 (40%)

        mockLlmResponse = JSON.stringify([
            { metric: "token_budget", action: "scale_down", message: "Decrease token budget.", proposed_value: 150000 },
            { metric: "cpu_usage", action: "reduce_nodes", message: "CPU usage is low." }
        ]);

        const tools = (server as any)._registeredTools || (server as any).registeredTools || (server as any).tools;
        const result = await tools.propose_capacity_adjustment.handler({
            horizon_days: 30,
            cpu_threshold: 0.8,
            memory_threshold: 0.8,
            company: "test",
            yoloMode: false
        });

        const parsed = JSON.parse(result.content[0].text);
        const recs = parsed.recommendations.join(" ");
        expect(recs).toContain("scale_down: Decrease token budget.");
        expect(recs).toContain("reduce_nodes: CPU usage is low.");
    });

    it("should write to EpisodicMemory when yoloMode is true", async () => {
        mockForecastMax = 1500000; // trigger budget update
        mockCpuMax = 5;

        mockLlmResponse = JSON.stringify([
            { metric: "token_budget", action: "scale_up", message: "Increase token budget.", proposed_value: 1800000 }
        ]);

        // Spy on the EpisodicMemory prototype store method
        const storeSpy = vi.spyOn(EpisodicMemory.prototype, "store");

        const tools = (server as any)._registeredTools || (server as any).registeredTools || (server as any).tools;
        const result = await tools.propose_capacity_adjustment.handler({
            horizon_days: 30,
            cpu_threshold: 0.8,
            memory_threshold: 0.8,
            company: "test",
            yoloMode: true
        });

        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.executed_actions).toBeInstanceOf(Array);
        expect(parsed.executed_actions.join(" ")).toContain("Logged autonomous_decision");
        expect(parsed.executed_actions.join(" ")).toContain("Updated corporate_policy");

        // Assert that EpisodicMemory.store was called at least twice (decision + policy update)
        expect(storeSpy).toHaveBeenCalled();
        expect(storeSpy.mock.calls.length).toBeGreaterThanOrEqual(2);

        // Verify one of the calls was for the policy
        const policyCall = storeSpy.mock.calls.find(call => call[11] === "corporate_policy");
        expect(policyCall).toBeDefined();
    });
});
