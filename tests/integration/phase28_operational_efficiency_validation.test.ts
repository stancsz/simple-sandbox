import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { mkdtemp, rm, writeFile, mkdir, readdir } from "fs/promises";
import { tmpdir } from "os";

// --- Mock Implementations ---
const { mockLLMQueue, mockMetrics } = vi.hoisted(() => {
    return {
        mockLLMQueue: [] as any[],
        mockMetrics: [] as any[]
    };
});

const mockGenerate = vi.fn().mockImplementation(async (system: string, history: any[]) => {
    const next = mockLLMQueue.shift();
    if (!next) return { thought: "End of script", tool: "none", args: {}, message: "Done" };
    if (typeof next === 'function') return await next(system, history);
    if (typeof next === 'object' && next.thought) return next; // Return structured response
    return { thought: "Generated response", tool: "none", args: {}, message: JSON.stringify(next) }; // Default to stringify if simple object
});

const mockEmbed = vi.fn().mockImplementation(async (text: string) => {
    return new Array(1536).fill(0.1);
});

// Mock the Logger to capture metrics synchronously for assertions
vi.mock("../../src/logger.js", async (importOriginal) => {
    const original = await importOriginal<any>();
    return {
        ...original,
        logMetric: vi.fn((agent: string, metric: string, value: number, tags: any) => {
            mockMetrics.push({ agent, metric, value, tags, timestamp: new Date().toISOString() });
        })
    };
});

// Mock Episodic Memory to avoid DB
const mockEpisodic = {
    recall: vi.fn().mockResolvedValue([]),
    store: vi.fn().mockResolvedValue(undefined),
    getRecentEpisodes: vi.fn().mockResolvedValue([])
};

vi.mock("../../src/brain/episodic.js", () => {
    return {
        EpisodicMemory: vi.fn(() => mockEpisodic)
    };
});

// Mock MCP for Business Ops Tool call
import { mockToolHandlers, resetMocks, MockMCP, MockMcpServer } from "./test_helpers/mock_mcp_server.js";

vi.mock("../../src/mcp.js", () => ({ MCP: MockMCP }));
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({ McpServer: MockMcpServer }));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({ StdioServerTransport: class { connect() {} } }));

// Mock Trigger
vi.mock("../../src/scheduler/trigger.js", () => ({
    handleTaskTrigger: async (task: any) => {
        if (mockLLMQueue.length > 0 && typeof mockLLMQueue[0] === 'function') {
             const fn = mockLLMQueue.shift();
             await fn(task);
        }
        return { exitCode: 0 };
    },
    killAllChildren: vi.fn()
}));

// Provide routing evaluate tool mock
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
    return {
        Client: class {
            connect = vi.fn().mockResolvedValue(undefined);
            callTool = vi.fn().mockImplementation(async ({name, arguments: args}) => {
                if (name === "evaluate_task_complexity") {
                    // Mock high complexity for complex tasks, low for routine
                    if (args.prompt && args.prompt.includes("strategic scan")) {
                        return { content: [{ text: JSON.stringify({ score: 9.5, recommended_model: "claude-3-opus-20240229", reasoning: "Complex mock" }) }] };
                    }
                    return { content: [{ text: JSON.stringify({ score: 3.5, recommended_model: "claude-3-haiku-20240307", reasoning: "Simple mock" }) }] };
                }
                return { content: [{ text: "Success" }] };
            });
        }
    }
});

import fs from 'fs';
vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        existsSync: vi.fn((path: string) => true)
    }
});
vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => {
    return { StdioClientTransport: class { constructor() {} } };
});

import { JobDelegator } from "../../src/scheduler/job_delegator.js";
import { BatchExecutor } from "../../src/batch/batch_orchestrator.js";
import { AdaptiveRouter } from "../../src/llm/router.js";
import { createLLMInstance } from "../../src/llm.js";

// Override createLLMInstance internally to return AdaptiveRouter for the test
vi.mock("../../src/llm/index.js", async (importOriginal) => {
     const orig = await importOriginal<any>();
     return {
         ...orig,
         createLLM: (model?: string) => new AdaptiveRouter({ provider: 'anthropic', model: model || 'claude-3-5-sonnet-latest' })
     }
});

// Mock config to ensure batching and routing are enabled
vi.mock("../../src/config.js", () => ({
    loadConfig: vi.fn().mockResolvedValue({
        batching: { enabled: true, windowMs: 100, maxBatchSize: 5, supportedTypes: ["strategic_scan"] },
        routing: { enabled: true, costProfiles: { "claude-3-opus-20240229": 15.0, "claude-3-haiku-20240307": 0.25 } },
        llmCache: { enabled: true, backend: "file" }
    })
}));

describe("Phase 28 Operational Efficiency Validation Test", () => {
    let testRoot: string;
    let delegator: JobDelegator;
    let batchExecutor: BatchExecutor;

    beforeEach(async () => {
        vi.clearAllMocks();
        resetMocks();
        mockLLMQueue.length = 0;
        mockMetrics.length = 0;

        // Reset episodic mocks
        mockEpisodic.recall.mockResolvedValue([]);
        mockEpisodic.store.mockResolvedValue(undefined);
        mockEpisodic.getRecentEpisodes.mockResolvedValue([]);

        testRoot = await mkdtemp(join(tmpdir(), "phase28-efficiency-"));
        vi.spyOn(process, "cwd").mockReturnValue(testRoot);

        // Setup Agent Dir structure mimicking the Showcase layout
        const agentDir = join(testRoot, ".agent");
        await mkdir(join(agentDir, "companies"), { recursive: true });
        await mkdir(join(agentDir, "cache", "llm"), { recursive: true });

        // Force config env
        process.env.JULES_AGENT_DIR = agentDir;

        delegator = new JobDelegator(agentDir);
        batchExecutor = new BatchExecutor();
    });

    afterEach(async () => {
        await rm(testRoot, { recursive: true, force: true });
    });

    it("should consolidate routine tasks via BatchExecutor", async () => {
        // Enqueue 3 similar strategic scan tasks
        const t1 = { id: "scan1", name: "strategic_scan_q1", prompt: "Scan Q1", company: "compA" };
        const t2 = { id: "scan2", name: "strategic_scan_q2", prompt: "Scan Q2", company: "compA" };
        const t3 = { id: "scan3", name: "strategic_scan_q3", prompt: "Scan Q3", company: "compA" };

        expect(batchExecutor.isBatchable(t1)).toBe(true);

        const p1 = batchExecutor.enqueue(t1);
        const p2 = batchExecutor.enqueue(t2);
        const p3 = batchExecutor.enqueue(t3);

        await batchExecutor.forceProcess();

        const results = await Promise.all([p1, p2, p3]);
        expect(results.length).toBe(3);
        // Force process executes a child process that resolves the queue items immediately
        expect(results[0].id).toBe("scan1");
        expect(results[0].status).toBe("success");
    });

    it("should dynamically route model based on complexity score and log savings", async () => {
        // Prepare router
        const router = new AdaptiveRouter({ provider: 'anthropic', model: 'claude-3-5-sonnet-latest' });

        // Simple task (should route to Haiku)
        await router.generate("You are an agent.", [{ role: "user", content: "Say hello" }]);

        // Complex task (should route to Opus)
        await router.generate("You are a strategist.", [{ role: "user", content: "Execute a strategic scan on Q4 data." }]);

        // Verify metrics
        const routerMetrics = mockMetrics.filter(m => m.metric === 'llm_router_model_selected');
        expect(routerMetrics.length).toBeGreaterThanOrEqual(2);

        const haikuSelection = routerMetrics.find(m => m.tags.model === 'claude-3-haiku-20240307');
        expect(haikuSelection).toBeDefined();

        const opusSelection = routerMetrics.find(m => m.tags.model === 'claude-3-opus-20240229');
        expect(opusSelection).toBeDefined();

        // Verify cost savings calculated (baseline opus 15.0 - haiku 0.25 = 14.75)
        const savingsMetrics = mockMetrics.filter(m => m.metric === 'llm_cost_savings_estimated');
        expect(savingsMetrics.length).toBeGreaterThanOrEqual(1);
        expect(savingsMetrics[0].value).toBe(14.75);
    });
});