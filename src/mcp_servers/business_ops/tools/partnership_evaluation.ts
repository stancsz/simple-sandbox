import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm.js";
import { getMarketData } from "./market_analysis.js";
import { readStrategy } from "../../brain/tools/strategy.js";
import { CorporatePolicy } from "../../../brain/schemas.js";
import { randomUUID } from "crypto";

// Helper to get the latest active policy (similar to policy_engine.ts)
async function getLatestPolicy(episodic: EpisodicMemory, company: string = "default"): Promise<CorporatePolicy | null> {
    const memories = await episodic.recall("corporate_policy", 10, company, "corporate_policy");
    if (!memories || memories.length === 0) return null;

    const policies = memories
        .map(m => {
            try {
                return JSON.parse(m.agentResponse) as CorporatePolicy;
            } catch {
                return null;
            }
        })
        .filter((p): p is CorporatePolicy => p !== null && p.isActive)
        .sort((a, b) => b.version - a.version);

    return policies.length > 0 ? policies[0] : null;
}

export function registerPartnershipEvaluationTools(server: McpServer) {
    server.tool(
        "evaluate_partnership_opportunity",
        "Evaluates a potential partnership opportunity against Corporate Strategy and Market Data.",
        {
            partner_name: z.string().describe("Name of the potential partner."),
            industry: z.string().describe("Industry of the partner."),
            proposed_value: z.number().describe("Estimated financial value of the partnership in USD."),
            risk_level: z.enum(["low", "medium", "high"]).describe("Assessed risk level of the partnership."),
            description: z.string().describe("Description of the partnership proposal.")
        },
        async (input) => {
            const memory = new EpisodicMemory();
            await memory.init();

            // 1. Query Corporate Strategy
            const strategy = await readStrategy(memory);

            // 2. Use Market Analysis for competitor/market impact
            const marketData = await getMarketData(input.industry, "Global");

            // 3. Evaluate with LLM
            const llm = createLLM();
            const prompt = `You are the Chief Business Officer. Evaluate the following partnership proposal:
Partner: ${input.partner_name}
Industry: ${input.industry}
Value: $${input.proposed_value}
Risk: ${input.risk_level}
Description: ${input.description}

Corporate Strategy:
${JSON.stringify(strategy)}

Market Data:
${JSON.stringify(marketData)}

Determine if this partnership aligns with the corporate strategy, assess the market impact, and provide a recommendation.
Return ONLY a valid JSON object matching this schema:
{
  "alignment_score": 0-100,
  "strategic_rationale": "string",
  "market_impact": "string",
  "recommendation": "approve" | "reject" | "escalate"
}`;

            const response = await llm.generate(prompt, []);
            let evaluationResult;
            try {
                const match = response.message?.match(/\{[\s\S]*\}/);
                evaluationResult = match ? JSON.parse(match[0]) : JSON.parse(response.message || "{}");
            } catch (e) {
                evaluationResult = {
                    alignment_score: 50,
                    strategic_rationale: "Failed to parse LLM evaluation.",
                    market_impact: "Unknown",
                    recommendation: "escalate"
                };
            }

            // 4. Enforce Policy Engine constraints
            let finalRecommendation = evaluationResult.recommendation;
            let policyViolation = null;

            const policy = await getLatestPolicy(memory);
            const authPolicy = policy?.parameters?.autonomous_decision_authority;

            if (authPolicy) {
                // If LLM approved, but it violates policy, we must escalate or reject
                if (evaluationResult.recommendation === "approve") {
                    if (input.proposed_value > authPolicy.max_contract_value) {
                        finalRecommendation = "escalate";
                        policyViolation = `Proposed value ($${input.proposed_value}) exceeds max_contract_value ($${authPolicy.max_contract_value}).`;
                    } else if (input.risk_level !== authPolicy.allowed_risk_score && authPolicy.allowed_risk_score !== "high" && input.risk_level === "high") {
                        // Very basic risk level comparison: if allowed is not high, and input is high, escalate
                        // For simplicity, let's strictly check if risk level exceeds allowed
                        const riskLevels = { "low": 1, "medium": 2, "high": 3 };
                        const allowedLevel = riskLevels[authPolicy.allowed_risk_score] || 2;
                        const currentLevel = riskLevels[input.risk_level] || 2;

                        if (currentLevel > allowedLevel) {
                            finalRecommendation = "escalate";
                            policyViolation = `Risk level (${input.risk_level}) exceeds allowed_risk_score (${authPolicy.allowed_risk_score}).`;
                        }
                    } else if (evaluationResult.alignment_score < authPolicy.auto_approve_threshold) {
                        finalRecommendation = "escalate";
                        policyViolation = `Alignment score (${evaluationResult.alignment_score}) is below auto_approve_threshold (${authPolicy.auto_approve_threshold}).`;
                    }
                }
            } else {
                // Default safe fallback if no policy explicitly allows auto-approval
                if (evaluationResult.recommendation === "approve") {
                    finalRecommendation = "escalate";
                    policyViolation = "No autonomous_decision_authority policy found. Defaulting to escalate.";
                }
            }

            evaluationResult.recommendation = finalRecommendation;
            if (policyViolation) {
                evaluationResult.policy_notes = policyViolation;
            }

            // 5. Log decision to Brain as autonomous_decision
            const decisionRecord = {
                decision_type: "partnership_evaluation",
                input,
                evaluation: evaluationResult,
                timestamp: Date.now()
            };

            await memory.store(
                `eval_partner_${Date.now()}_${randomUUID().substring(0,8)}`,
                `Evaluated partnership with ${input.partner_name}`,
                JSON.stringify(decisionRecord),
                ["partnership", "evaluation", "phase_29"],
                undefined,
                [],
                false,
                undefined,
                undefined,
                0,
                0,
                "autonomous_decision"
            );

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(evaluationResult, null, 2)
                }]
            };
        }
    );

    server.tool(
        "simulate_partnership_outcomes",
        "Simulates the financial and strategic outcomes of a proposed partnership.",
        {
            partner_name: z.string().describe("Name of the partner for the simulation scenario."),
            duration_months: z.number().describe("Expected duration of the partnership in months."),
            investment_cost: z.number().describe("Upfront investment cost in USD."),
            expected_monthly_revenue: z.number().describe("Expected monthly revenue from the partnership in USD.")
        },
        async (input) => {
            const memory = new EpisodicMemory();
            await memory.init();

            // 1. Run financial projections
            const totalRevenue = input.expected_monthly_revenue * input.duration_months;
            const netProfit = totalRevenue - input.investment_cost;
            const roi = input.investment_cost > 0 ? (netProfit / input.investment_cost) * 100 : 0;

            // 2. Query Corporate Strategy
            const strategy = await readStrategy(memory);

            // 3. Evaluate projection with LLM
            const llm = createLLM();
            const prompt = `You are a Financial Analyst. Review these partnership simulation results:
Partner: ${input.partner_name}
Duration: ${input.duration_months} months
Investment: $${input.investment_cost}
Monthly Revenue: $${input.expected_monthly_revenue}
Total Projected Revenue: $${totalRevenue}
Projected Net Profit: $${netProfit}
Projected ROI: ${roi}%

Corporate Strategy:
${JSON.stringify(strategy)}

Provide an assessment of these financials. Return ONLY a valid JSON object matching this schema:
{
  "financial_viability": "strong" | "moderate" | "weak",
  "risk_assessment": "string",
  "projected_roi_percentage": number,
  "recommendation": "proceed" | "renegotiate" | "abandon"
}`;

            const response = await llm.generate(prompt, []);
            let simulationResult;
            try {
                const match = response.message?.match(/\{[\s\S]*\}/);
                simulationResult = match ? JSON.parse(match[0]) : JSON.parse(response.message || "{}");
            } catch (e) {
                simulationResult = {
                    financial_viability: "weak",
                    risk_assessment: "Failed to parse simulation evaluation.",
                    projected_roi_percentage: roi,
                    recommendation: "abandon"
                };
            }

            // 4. Log simulation to Brain
            const simulationRecord = {
                decision_type: "partnership_simulation",
                input,
                financials: { totalRevenue, netProfit, roi },
                evaluation: simulationResult,
                timestamp: Date.now()
            };

            await memory.store(
                `sim_partner_${Date.now()}_${randomUUID().substring(0,8)}`,
                `Simulated partnership with ${input.partner_name}`,
                JSON.stringify(simulationRecord),
                ["partnership", "simulation", "phase_29"],
                undefined,
                [],
                false,
                undefined,
                undefined,
                0,
                0,
                "autonomous_decision"
            );

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        raw_financials: { totalRevenue, netProfit, roi },
                        assessment: simulationResult
                    }, null, 2)
                }]
            };
        }
    );
}
