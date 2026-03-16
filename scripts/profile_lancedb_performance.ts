import { EpisodicMemory } from "../src/brain/episodic.js";
import { randomUUID } from "crypto";
import { performance } from "perf_hooks";

async function profile() {
    console.log("Starting LanceDB Performance Profiling...");

    // We'll use MOCK_EMBEDDINGS to speed up the embedding process
    // so we strictly measure LanceDB performance
    process.env.MOCK_EMBEDDINGS = "true";

    const company = "perf_test_company_" + Date.now();
    const memory = new EpisodicMemory(process.cwd());
    await memory.init();

    // 1. Insert synthetic data
    console.log("Inserting 100 synthetic memories...");
    for (let i = 0; i < 100; i++) {
        await memory.store(
            randomUUID(),
            `User query about performance ${i}`,
            `Agent response to query ${i}`,
            [],
            company
        );
    }
    console.log("Insertion complete.");

    // 2. Profile concurrent queries
    console.log("Profiling 50 simultaneous queries...");

    const queries = [];
    for (let i = 0; i < 50; i++) {
        queries.push(`query about performance ${i % 10}`);
    }

    // Take baseline metrics
    const startMem = process.memoryUsage();
    const startTime = performance.now();

    // Run concurrent queries using Promise.all
    // EpisodicMemory.recall uses LanceDB table.search()
    await Promise.all(queries.map(q => memory.recall(q, 3, company)));

    const endTime = performance.now();
    const endMem = process.memoryUsage();

    const latency = endTime - startTime;
    const memUsed = (endMem.heapUsed - startMem.heapUsed) / 1024 / 1024;

    console.log("\n--- Profiling Results ---");
    console.table([
        {
            Metric: "Total Latency (50 queries)",
            Value: `${latency.toFixed(2)} ms`
        },
        {
            Metric: "Average Latency per Query",
            Value: `${(latency / 50).toFixed(2)} ms`
        },
        {
            Metric: "Memory Usage Delta",
            Value: `${memUsed.toFixed(2)} MB`
        }
    ]);

    console.log("Profiling complete.");
    process.exit(0);
}

profile().catch(console.error);
