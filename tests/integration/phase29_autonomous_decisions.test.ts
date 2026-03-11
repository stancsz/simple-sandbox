import { describe, it, expect, beforeAll, vi, afterAll } from "vitest";
import { MockMCP, MockMcpServer, resetMocks } from "./test_helpers/mock_mcp_server.js";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { registerPartnershipEvaluationTools } from "../../src/mcp_servers/business_ops/tools/partnership_evaluation.js";
import { registerPolicyEngineTools } from "../../src/mcp_servers/business_ops/tools/policy_engine.js";

// Mock LLM
vi.mock("../../src/llm.js", () => {
    return {
        LLM: vi.fn().mockImplementation(() => ({
             embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
             generate: vi.fn()
        })),
        createLLM: vi.fn(() => ({
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
            generate: vi.fn().mockImplementation(async (prompt: string) => {
                if (prompt.includes("Evaluate the following partnership proposal") && prompt.includes("LowRiskPartner")) {
                    return {
                        message: JSON.stringify({
                            alignment_score: 95,
                            strategic_rationale: "Strong alignment with core objectives.",
                            market_impact: "Positive expansion in target demographic.",
                            recommendation: "approve"
                        })
                    };
                } else if (prompt.includes("Evaluate the following partnership proposal") && prompt.includes("HighRiskPartner")) {
                    return {
                         message: JSON.stringify({
                            alignment_score: 60,
                            strategic_rationale: "Moderate alignment but high risk.",
                            market_impact: "Uncertain market penetration.",
                            recommendation: "approve" // LLM approves, but policy should catch it
                        })
                    };
                } else if (prompt.includes("Review these partnership simulation results")) {
                    return {
                         message: JSON.stringify({
                            financial_viability: "strong",
                            risk_assessment: "Low financial risk.",
                            projected_roi_percentage: 150,
                            recommendation: "proceed"
                        })
                    };
                }

                return {
                    message: JSON.stringify({
                        alignment_score: 50,
                        strategic_rationale: "Default response.",
                        market_impact: "Unknown",
                        recommendation: "escalate"
                    })
                };
            })
        }))
    };
});

describe("Phase 29: Advanced Autonomous Decision Making Validation", () => {
    let mcp: MockMCP;
    let memory: EpisodicMemory;

    beforeAll(async () => {
        mcp = new MockMCP();
        memory = new EpisodicMemory();
        await memory.init();

        // Ensure memory is clean for the test
        // In a real scenario we'd use a test DB, but EpisodicMemory mock/test setup usually handles this or uses a local dir

        resetMocks();

        // We will manually register the tools into a mock server instance for testing
        const server = new MockMcpServer({ name: "business_ops", version: "1.0.0" }) as any;
        registerPolicyEngineTools(server);
        registerPartnershipEvaluationTools(server);
    });

    afterAll(() => {
        vi.restoreAllMocks();
    });

    it("should establish a corporate policy with autonomous decision authority", async () => {
        const client = await mcp.getClient("business_ops");

        const response = await client.callTool({
            name: "update_operating_policy",
            arguments: {
                name: "Phase 29 Policy",
                description: "Policy supporting autonomous decisions",
                min_margin: 0.2,
                risk_tolerance: "medium",
                max_agents_per_swarm: 5,
                max_contract_value: 100000,
                allowed_risk_score: "medium",
                auto_approve_threshold: 80,
                company: "default" // Must match what getLatestPolicy uses by default
            }
        });

        const content = JSON.parse(response.content[0].text);
        expect(content.status).toBe("success");
        expect(content.policy.parameters.autonomous_decision_authority).toBeDefined();
        expect(content.policy.parameters.autonomous_decision_authority.max_contract_value).toBe(100000);
    });

    it("should evaluate and auto-approve a low-risk, highly aligned partnership", async () => {
        const client = await mcp.getClient("business_ops");

        const response = await client.callTool({
            name: "evaluate_partnership_opportunity",
            arguments: {
                partner_name: "LowRiskPartner",
                industry: "Software",
                proposed_value: 50000,
                risk_level: "low",
                description: "A strategic software integration partnership."
            }
        });

        const result = JSON.parse(response.content[0].text);

        // Should be approved because it's under 100k, risk is low (<= medium), and score is 95 (>= 80)
        expect(result.recommendation).toBe("approve");
        expect(result.alignment_score).toBe(95);
        expect(result.policy_notes).toBeUndefined();
    });

    it("should evaluate and escalate a high-risk partnership despite LLM approval", async () => {
        const client = await mcp.getClient("business_ops");

        const response = await client.callTool({
            name: "evaluate_partnership_opportunity",
            arguments: {
                partner_name: "HighRiskPartner",
                industry: "Hardware",
                proposed_value: 150000, // Exceeds 100k limit
                risk_level: "high",     // Exceeds medium limit
                description: "A risky hardware manufacturing partnership."
            }
        });

        expect(response.isError).toBeFalsy();
        const result = JSON.parse(response.content[0].text);

        // The LLM mock returns "approve", but the policy engine should override it to "escalate"
        expect(result.recommendation).toBe("escalate");
        expect(result.policy_notes).toContain("exceeds max_contract_value");
    });

    it("should successfully simulate financial outcomes of a partnership", async () => {
        const client = await mcp.getClient("business_ops");

        const response = await client.callTool({
            name: "simulate_partnership_outcomes",
            arguments: {
                partner_name: "SimulatedPartner",
                duration_months: 12,
                investment_cost: 10000,
                expected_monthly_revenue: 5000
            }
        });

        expect(response.isError).toBeFalsy();
        const result = JSON.parse(response.content[0].text);

        expect(result.raw_financials.totalRevenue).toBe(60000);
        expect(result.raw_financials.netProfit).toBe(50000);
        expect(result.raw_financials.roi).toBe(500); // 50000 / 10000 * 100

        expect(result.assessment.financial_viability).toBe("strong");
    });

    it("should have logged the decisions to EpisodicMemory", async () => {
        // Query memory for autonomous_decision records
        const memories = await memory.recall("partnership", 10, undefined, "autonomous_decision");

        expect(memories.length).toBeGreaterThanOrEqual(3); // 2 evaluations, 1 simulation

        // Check that one of the memories is the high risk evaluation
        const highRiskMem = memories.find(m => m.userPrompt.includes("HighRiskPartner"));
        expect(highRiskMem).toBeDefined();

        const parsedData = JSON.parse(highRiskMem!.agentResponse);
        expect(parsedData.decision_type).toBe("partnership_evaluation");
        expect(parsedData.evaluation.recommendation).toBe("escalate");
    });
});
