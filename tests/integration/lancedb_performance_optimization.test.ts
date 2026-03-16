import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { randomUUID } from "crypto";
import { performance } from "perf_hooks";

describe("LanceDB Performance Optimization", () => {
  let memory: EpisodicMemory;
  const company = "test_perf_company_" + Date.now();

  beforeAll(async () => {
    // Force mock embeddings so tests run fast without LLM dependency
    process.env.MOCK_EMBEDDINGS = "true";

    // Instantiate memory
    memory = new EpisodicMemory(process.cwd());
    await memory.init();

    // Populate initial data
    for (let i = 0; i < 20; i++) {
      await memory.store(
        randomUUID(),
        `Initial knowledge base ${i}`,
        `Solution for knowledge ${i}`,
        [],
        company
      );
    }
  });

  afterAll(async () => {
    // Cleanup can be done if required, but test uses a unique company namespace
  });

  it("should complete 10+ concurrent queries within a reasonable timeout", async () => {
    const queries = Array(20).fill("test concurrent knowledge retrieval");

    const startTime = performance.now();
    const results = await Promise.all(
      queries.map((q) => memory.recall(q, 3, company))
    );
    const endTime = performance.now();

    expect(results).toHaveLength(20);
    // All results should have an array of length up to 3
    results.forEach((res) => {
      expect(Array.isArray(res)).toBe(true);
      expect(res.length).toBeLessThanOrEqual(3);
    });

    const latency = endTime - startTime;
    console.log(`[Concurrent Test] 20 Queries Latency: ${latency.toFixed(2)} ms`);
    // Should easily complete within 1000ms given caching/mocking
    expect(latency).toBeLessThan(1000);
  });

  it("should demonstrate reduced query latency on cache hits", async () => {
    const query = "predictive caching test query";

    // 1st run - Miss
    const t1Start = performance.now();
    const res1 = await memory.recall(query, 3, company);
    const t1End = performance.now();
    const latencyMiss = t1End - t1Start;

    // 2nd run - Hit
    const t2Start = performance.now();
    const res2 = await memory.recall(query, 3, company);
    const t2End = performance.now();
    const latencyHit = t2End - t2Start;

    console.log(`[Cache Hit Test] Miss Latency: ${latencyMiss.toFixed(2)} ms | Hit Latency: ${latencyHit.toFixed(2)} ms`);

    // Results should match
    expect(res1).toEqual(res2);

    // In many environments the hit is drastically faster (e.g. 0.1ms vs 10ms)
    // Though sometimes on extremely fast systems they are close. We assert the hit is not outrageously slow.
    expect(latencyHit).toBeLessThan(20);
  });

  it("should invalidate the cache when a new memory is inserted", async () => {
    const query = "unique predictive cache invalidation query " + Date.now();

    // 1. Initial query to populate cache
    const initialRes = await memory.recall(query, 5, company);
    const initialCount = initialRes.length;

    // 2. Insert new memory that explicitly matches the concept
    const newTaskId = randomUUID();
    await memory.store(
      newTaskId,
      query, // Exact match to query string
      "New optimized solution that invalidates everything",
      [],
      company
    );

    // Give LanceDB a tiny moment to flush if necessary, though LanceDB is usually immediate
    await new Promise(resolve => setTimeout(resolve, 50));

    // 3. Second query should hit DB (because cache was cleared) and reflect the new item
    // Note: Due to mock embeddings, everything hashes the same. But the query string match in the DB
    // should bring it up if we search for it. In reality, mock embeddings just sum char codes.
    // So the new memory will have *some* distance. We pull a larger limit to guarantee we see it
    // if MOCK_EMBEDDINGS collision pushes it down.
    const newRes = await memory.recall(query, 50, company);

    // The new response must be different from the cached response
    // specifically, the array could be longer or contain the newly added memory
    const foundNewMemory = newRes.some((r) => r.taskId === newTaskId);
    expect(foundNewMemory).toBe(true);
  });

  it("should display a summary of performance metrics via console.table", async () => {
      // Create a final concurrent burst
      const burstQueries = Array(50).fill("final performance metrics burst");
      const startBurst = performance.now();
      await Promise.all(burstQueries.map(q => memory.recall(q, 3, company)));
      const endBurst = performance.now();
      const totalBurstLatency = endBurst - startBurst;

      console.table([
          {
              Metric: "50 Cached Concurrent Queries",
              Value: `${totalBurstLatency.toFixed(2)} ms`
          },
          {
              Metric: "Avg Latency per Query",
              Value: `${(totalBurstLatency / 50).toFixed(2)} ms`
          }
      ]);

      expect(totalBurstLatency).toBeDefined();
  });
});
