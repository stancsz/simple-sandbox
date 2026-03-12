import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEvaluateStrategicPivot } from '../../src/mcp_servers/strategic_decision/tools/evaluate_strategic_pivot.js';
import { registerExecuteAutonomousDecision } from '../../src/mcp_servers/strategic_decision/tools/execute_autonomous_decision.js';
import { registerMonitorDecisionOutcomes } from '../../src/mcp_servers/strategic_decision/tools/monitor_decision_outcomes.js';

// We mock the LLM and the cross-server transport mechanics so we don't need real nested processes
vi.mock('../../src/llm.js', () => ({
    createLLM: () => ({
        generate: vi.fn().mockImplementation(async (prompt) => {
             if (prompt.includes("evaluate a past autonomous decision")) {
                 return { message: JSON.stringify({ outcome_status: "success", score: 85, learnings: "The policy adjustment correctly improved margin." }) };
             }
             if (prompt.includes("analyze the predictive forecast data")) {
                 return { message: JSON.stringify({
                     recommended_actions: ["Shift focus to high-margin services"],
                     target_metrics: { "margin": 0.30 },
                     policy_updates: { "min_margin": 0.30, "risk_tolerance": "medium" },
                     rationale: "Projected margin drop requires immediate policy intervention."
                 })};
             }
             return { message: "{}" };
        })
    })
}));

// Mock the Episodic Memory used by the tools
const mockMemoryStore: any[] = [];
vi.mock('../../src/brain/episodic.js', () => {
    return {
        EpisodicMemory: class {
            constructor() {}
            async store(id: string, query: string, agentResponse: string, tags: string[], company: string, ...args: any[]) {
                const memId = args[3] || id; // extract provided ID
                // simulate overwrite if exists
                const existingIdx = mockMemoryStore.findIndex(m => m.id === memId);
                const mem = { id: memId, agentResponse, timestamp: Date.now() };
                if (existingIdx >= 0) {
                    mockMemoryStore[existingIdx] = mem;
                } else {
                    mockMemoryStore.push(mem);
                }
            }
            async recall(query: string, limit: number, company: string, type: string) {
                // Return everything as "pending" or "evaluated" depending on what we pushed
                return mockMemoryStore;
            }
        }
    };
});

// We must mock the tool registry calls directly, because `createClient` inside the tools
// spawns Node processes. Instead of spinning up full child processes in tests,
// we intercept the `Client` instantiation in the tools.
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
    Client: class {
        constructor() {}
        async connect() {}
        async close() {}
        async callTool({ name, arguments: args }: any) {
            if (name === 'read_strategy') {
                 return { content: [{ text: JSON.stringify({ objectives: ["Increase Margin"] }) }] };
            }
            if (name === 'forecast_metric') {
                 return { content: [{ text: JSON.stringify({ forecast: [{ predicted_value: 0.15 }] }) }] }; // Bad margin forecast
            }
            if (name === 'update_operating_policy') {
                 return { content: [{ text: "Policy updated" }] };
            }
            if (name === 'balance_fleet_resources') {
                 return { content: [{ text: "Fleet balanced" }] };
            }
            return { content: [{ text: "Mocked" }] };
        }
    }
}));

// We also need to mock `createClient` wrapper which uses `existsSync` and `join`
// The easiest way is to mock `StdioClientTransport` to bypass the actual spawn
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
    StdioClientTransport: class {
        constructor() {}
    }
}));


describe('Strategic Decision Engine Validation (Phase 30)', () => {
    let server: McpServer;

    beforeEach(() => {
        server = new McpServer({ name: "test-strategic", version: "1.0" });
        registerEvaluateStrategicPivot(server);
        registerExecuteAutonomousDecision(server);
        registerMonitorDecisionOutcomes(server);
        mockMemoryStore.length = 0; // clear array
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should evaluate a strategic pivot based on a bad forecast', async () => {
        const tools: any = (server as any)._registeredTools || (server as any).registeredTools || (server as any).tools;
        let evaluateTool = tools instanceof Map ? tools.get("evaluate_strategic_pivot") : tools["evaluate_strategic_pivot"];
        if (!evaluateTool) {
             evaluateTool = Object.values(tools).find((t: any) => t.name === "evaluate_strategic_pivot");
        }

        const result: any = await evaluateTool.handler({
            company: 'test-co', metric_name: 'margin', horizon_days: 30
        }, {} as any);

        expect(result.isError).toBeUndefined(); // Handler usually returns directly, doesn't always have isError. If it throws, it fails test.
        const jsonContent = JSON.parse(result.content[0].text);

        expect(jsonContent.recommended_actions).toContain("Shift focus to high-margin services");
        expect(jsonContent.policy_updates.min_margin).toBe(0.30);
        expect(jsonContent.rationale).toBe("Projected margin drop requires immediate policy intervention.");
    });

    it('should execute the autonomous decision and record it to episodic memory', async () => {
         const tools: any = (server as any)._registeredTools || (server as any).registeredTools || (server as any).tools;
         let executeTool = tools instanceof Map ? tools.get("execute_autonomous_decision") : tools["execute_autonomous_decision"];
         if (!executeTool) {
             executeTool = Object.values(tools).find((t: any) => t.name === "execute_autonomous_decision");
         }

         const result: any = await executeTool.handler({
             company: 'test-co',
             recommended_actions: ["Shift focus to high-margin services"],
             target_metrics: { margin: 0.30 },
             policy_updates: { min_margin: 0.30, risk_tolerance: "medium" },
             rationale: "Projected margin drop requires immediate policy intervention."
         }, {} as any);

         expect(result.isError).toBeUndefined();
         expect(result.content[0].text).toContain("Successfully executed autonomous decision.");
         expect(result.content[0].text).toContain("Updated Operating Policy");
         expect(result.content[0].text).toContain("Triggered Fleet Balancing");

         // Verify it was stored in our mocked memory
         expect(mockMemoryStore.length).toBe(1);
         const storedMem = JSON.parse(mockMemoryStore[0].agentResponse);
         expect(storedMem.status).toBe("executed");
         expect(storedMem.rationale).toBe("Projected margin drop requires immediate policy intervention.");
         expect(storedMem.policy_updates.min_margin).toBe(0.30);
    });

    it('should monitor decision outcomes and update the decision with an evaluation score', async () => {
         // First, inject a pending decision into memory
         mockMemoryStore.push({
             id: 'test-decision-id',
             timestamp: Date.now() - 1000,
             agentResponse: JSON.stringify({
                 id: 'test-decision-id',
                 status: 'executed',
                 evaluation: null,
                 rationale: 'Test pivot',
                 target_metrics: { margin: 0.30 },
                 executedActions: ['Updated policy']
             })
         });

         const tools: any = (server as any)._registeredTools || (server as any).registeredTools || (server as any).tools;
         let monitorTool = tools instanceof Map ? tools.get("monitor_decision_outcomes") : tools["monitor_decision_outcomes"];
         if (!monitorTool) {
             monitorTool = Object.values(tools).find((t: any) => t.name === "monitor_decision_outcomes");
         }

         const result: any = await monitorTool.handler({
             company: 'test-co', lookback_days: 7
         }, {} as any);

         expect(result.isError).toBeUndefined();
         expect(result.content[0].text).toContain("Evaluated 1 decisions.");

         // Check memory update
         expect(mockMemoryStore.length).toBe(1); // the ID should have matched and overwritten
         const evaluatedMem = JSON.parse(mockMemoryStore[0].agentResponse);
         expect(evaluatedMem.status).toBe("evaluated");
         expect(evaluatedMem.evaluation).toBeDefined();
         expect(evaluatedMem.evaluation.outcome_status).toBe("success");
         expect(evaluatedMem.evaluation.score).toBe(85);
         expect(evaluatedMem.evaluation.learnings).toContain("improved margin");
    });
});
