import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDemandForecastingTools } from "../../src/mcp_servers/business_ops/tools/forecasting.js";
import { _resetDb, record_metric, getDb } from "../../src/mcp_servers/forecasting/models.js";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import Database from "better-sqlite3";

let testDb: ReturnType<typeof Database> | null = null;
vi.mock("../../src/mcp_servers/forecasting/models.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../src/mcp_servers/forecasting/models.js")>();
    return {
        ...actual,
        getDb: vi.fn(() => {
            if (!testDb) {
                testDb = new Database(':memory:');
                testDb.exec(`
                  CREATE TABLE IF NOT EXISTS metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    metric_name TEXT NOT NULL,
                    value REAL NOT NULL,
                    timestamp DATETIME NOT NULL,
                    company TEXT NOT NULL
                  );
                `);
            }
            return testDb;
        }),
        _resetDb: vi.fn(() => {
            if (testDb) {
                testDb.close();
                testDb = null;
            }
        })
    };
});

// Mock LLM to avoid real API calls
vi.mock("../../src/llm.js", () => {
  return {
    createLLM: vi.fn(() => ({
      generate: vi.fn().mockResolvedValue(`
        \`\`\`json
        {
          "recommendations": ["Scale swarm capacity by 20% next month", "Optimize API usage to reduce costs"],
          "policy_implications": ["Decrease max_agents_per_swarm from 10 to 8", "Update auto_approve_threshold to $500"]
        }
        \`\`\`
      `),
    })),
    LLM: class MockLLM {
      async generate() { return "mock"; }
    }
  };
});

// Mock EpisodicMemory to avoid real vector DB calls
vi.mock("../../src/brain/episodic.js", () => {
    let mockStore: any[] = [];
    return {
        EpisodicMemory: class MockEpisodicMemory {
            async search(query: string, limit: number) {
                // simple mock implementation of cache matching
                const res = mockStore.filter(i => i.query === query).slice(0, limit);
                return res;
            }
            async store(query: string, request: string, content: string, tags: string[], company: string) {
                mockStore.unshift({
                    query,
                    agentResponse: content,
                    timestamp: Date.now()
                });
                return "mock_id";
            }
            // For testing: allow resetting mock store between runs
            static _resetMockStore() {
                mockStore = [];
            }
        }
    };
});

// Mock Strategy Tool to avoid real Brain calls
vi.mock("../../src/mcp_servers/brain/tools/strategy.js", () => {
    return {
        readStrategy: vi.fn().mockResolvedValue({
            vision: "Maintain sustainable growth in Ghost Mode",
            objectives: ["Optimize token usage", "Increase ROI"],
            policies: { max_agents_per_swarm: 10, risk_tolerance: "medium" },
            timestamp: Date.now()
        })
    };
});

describe("Demand Prediction Integration (Phase 29)", () => {
    let server: McpServer;
    const testCompany = "@simple-cli/showcase";

    beforeEach(() => {
        // Reset DB and Memory for isolation
        _resetDb();
        const db = getDb();
        db.exec("DELETE FROM metrics;");

        (EpisodicMemory as any)._resetMockStore();

        server = new McpServer({ name: "test_business_ops", version: "1.0.0" });
        registerDemandForecastingTools(server);

        // Let's create an increasing trend for 'llm_token_usage' over the last 5 days
        const baseDate = Date.now() - (5 * 24 * 60 * 60 * 1000);

        // Ensure test records are written to the correctly mocked DB
        const testDb = getDb();
        const stmt = testDb.prepare(`
            INSERT INTO metrics (metric_name, value, timestamp, company)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run('llm_token_usage', 1000, new Date(baseDate).toISOString(), testCompany);
        stmt.run('llm_token_usage', 1200, new Date(baseDate + 86400000).toISOString(), testCompany);
        stmt.run('llm_token_usage', 1500, new Date(baseDate + 2 * 86400000).toISOString(), testCompany);
        stmt.run('llm_token_usage', 1900, new Date(baseDate + 3 * 86400000).toISOString(), testCompany);
        stmt.run('llm_token_usage', 2400, new Date(baseDate + 4 * 86400000).toISOString(), testCompany);
    });

    afterEach(async () => {
        _resetDb();
        // Clear the cache from EpisodicMemory for test determinism
        const db = getDb();
        db.exec("DELETE FROM metrics;");
    });

    it("should successfully forecast demand, identify an increasing trend, and align with corporate strategy", async () => {
        // Mock the MCP request to call the tool
        // @ts-ignore
        const handler = server._registeredTools.forecast_demand.handler;
        expect(handler).toBeDefined();

        const result = await handler({
             metric_name: "llm_token_usage",
             forecast_horizon: "7d",
             company: testCompany
        }, { request: { method: 'tools/call', params: {} } });

        expect(result.isError).toBeUndefined();
        expect(result.content).toBeDefined();

        const contentStr = result.content[0].text;
        const parsedResponse = JSON.parse(contentStr);

        // 1. Validate Statistical Trend Direction
        expect(parsedResponse.metric_name).toBe("llm_token_usage");
        expect(parsedResponse.company).toBe(testCompany);
        expect(parsedResponse.trend).toBe("increasing");

        // 2. Validate Forecast Horizon
        expect(parsedResponse.forecast_values.length).toBe(7);
        // The first predicted value should be > 2400 (our last data point) because the trend is increasing
        // Note: The simple-statistics linear regression line equation `y = mx + b` evaluates to 2650 for the 6th point
        expect(parsedResponse.forecast_values[0].predicted_value).toBeGreaterThan(2400);

        // 3. Validate Strategy/LLM Integration Outputs
        expect(parsedResponse.recommendations.length).toBeGreaterThan(0);
        expect(parsedResponse.recommendations).toContain("Scale swarm capacity by 20% next month");
        expect(parsedResponse.policy_implications.length).toBeGreaterThan(0);
        expect(parsedResponse.policy_implications).toContain("Decrease max_agents_per_swarm from 10 to 8");
    });

    it("should return cached results if queried within 24 hours (idempotency check)", async () => {
        // @ts-ignore
        const handler = server._registeredTools.forecast_demand.handler;

        // First Call
        const result1 = await handler({
             metric_name: "llm_token_usage",
             forecast_horizon: "7d",
             company: testCompany
        }, { request: { method: 'tools/call', params: {} } });
        const parsed1 = JSON.parse(result1.content[0].text);

        // Update DB to simulate new data (should NOT be reflected in cached result)
        const testDb = getDb();
        testDb.prepare(`
            INSERT INTO metrics (metric_name, value, timestamp, company)
            VALUES (?, ?, ?, ?)
        `).run('llm_token_usage', 999999, new Date().toISOString(), testCompany);

        // Second Call
        const result2 = await handler({
             metric_name: "llm_token_usage",
             forecast_horizon: "7d",
             company: testCompany
        }, { request: { method: 'tools/call', params: {} } });
        const parsed2 = JSON.parse(result2.content[0].text);

        // Assert exact match from cache despite underlying data change
        expect(parsed1.forecast_values[0].predicted_value).toBe(parsed2.forecast_values[0].predicted_value);
    });
});
