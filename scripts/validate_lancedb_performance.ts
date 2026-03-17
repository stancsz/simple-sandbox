import { LanceConnector } from "../src/mcp_servers/brain/lance_connector.js";
import { join } from "path";
import { mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { performance } from "perf_hooks";

const TEST_AGENT_DIR = join(process.cwd(), ".agent_perf_test_live");
const NUM_TENANTS = 100;
const DOCS_PER_TENANT = 256;
const QUERIES_PER_TENANT = 20;

async function runBenchmark() {
    console.log(`Setting up ${NUM_TENANTS} tenants with ${DOCS_PER_TENANT} documents each...`);

    if (existsSync(TEST_AGENT_DIR)) {
        await rm(TEST_AGENT_DIR, { recursive: true, force: true });
    }
    await mkdir(TEST_AGENT_DIR, { recursive: true });

    const setupStart = performance.now();
    for (let i = 0; i < NUM_TENANTS; i++) {
        const companyId = `perf-company-${i}`;
        const dbPath = join(TEST_AGENT_DIR, "companies", companyId, "brain");

        const connector = new LanceConnector(dbPath);
        await connector.withLock("default", async () => {
            const data = [];
            for (let j = 0; j < DOCS_PER_TENANT; j++) {
                const content = `This is document ${j} for company ${i}. It contains some strategic context.`;
                const hash = content.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) + (j * 13);
                const vector = new Array(1536).fill(0).map((_, k) => ((hash * (k + 1 + j)) % 1000) / 1000);

                data.push({
                    id: `doc-${j}`,
                    content,
                    source: `file-${j}.txt`,
                    vector
                });
            }

            try {
                await connector.createTable("documents", data);
            } catch (e) {
                const table = await connector.getTable("documents");
                if (table) {
                    await table.add(data);
                    await connector.optimizeTable("documents");
                }
            }
        });
        if ((i + 1) % 10 === 0) {
            console.log(`Setup ${i + 1}/${NUM_TENANTS} tenants`);
        }
    }
    const setupTime = performance.now() - setupStart;
    console.log(`Setup complete in ${(setupTime / 1000).toFixed(2)}s. Starting concurrent queries benchmark...`);

    const startMem = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    const latencies: number[] = [];
    const queryPromises = [];

    // First do direct queries individually (pre-optimization simulation if needed)
    // But we actually want to test the new batchQuery optimization in a multi-tenant scenario

    // Simulate 100 concurrent tenants making queries simultaneously using batching where appropriate
    for (let i = 0; i < NUM_TENANTS; i++) {
        const companyId = `perf-company-${i}`;
        const dbPath = join(TEST_AGENT_DIR, "companies", companyId, "brain");
        const connector = new LanceConnector(dbPath);

        // Group queries by tenant to simulate an optimized batch request from a single client
        const vectors = [];
        for (let q = 0; q < QUERIES_PER_TENANT; q++) {
             const qStr = `Query ${q} for company ${i}`;
             const hash = qStr.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
             vectors.push(new Array(1536).fill(0).map((_, k) => ((hash * (k + 1)) % 1000) / 1000));
        }

        queryPromises.push((async () => {
             const qStart = performance.now();

             // Utilizing batchQuery optimization
             await connector.batchQuery("documents", vectors, 3);

             const qEnd = performance.now();
             // Record latency per individual logical query for metric parity
             const perQueryLatency = (qEnd - qStart) / QUERIES_PER_TENANT;
             for (let j = 0; j < QUERIES_PER_TENANT; j++) {
                 latencies.push(perQueryLatency);
             }
        })());
    }

    await Promise.all(queryPromises);

    const endTime = performance.now();
    const endMem = process.memoryUsage().heapUsed;

    latencies.sort((a, b) => a - b);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.50)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const max = latencies[latencies.length - 1];

    const memUsedMB = (endMem - startMem) / 1024 / 1024;
    const totalTimeStr = ((endTime - startTime) / 1000).toFixed(2);

    // Concurrent query rate
    const qps = (latencies.length / (endTime - startTime)) * 1000;

    console.log("\n=== Production Scalability Benchmark Results ===");
    console.log(`Concurrent Tenants: ${NUM_TENANTS}`);
    console.log(`Total Queries: ${latencies.length}`);
    console.log(`Total Execution Time: ${totalTimeStr}s`);
    console.log(`Throughput: ${qps.toFixed(2)} Queries/sec`);
    console.log(`Memory Used (Delta): ${memUsedMB.toFixed(2)} MB`);
    console.log(`\n--- Latency Percentiles ---`);
    console.log(`Average: ${avg.toFixed(2)} ms`);
    console.log(`p50:     ${p50.toFixed(2)} ms`);
    console.log(`p95:     ${p95.toFixed(2)} ms`);
    console.log(`p99:     ${p99.toFixed(2)} ms`);
    console.log(`Max:     ${max.toFixed(2)} ms`);
    console.log("==============================================\n");

    if (p99 > 2000) {
        console.warn("⚠️ p99 latency exceeds 2000ms threshold! Optimization needed.");
    } else {
        console.log("✅ Performance within acceptable thresholds.");
    }

    // Cleanup
    if (!process.env.KEEP_TEST_DATA) {
        await rm(TEST_AGENT_DIR, { recursive: true, force: true });
    }
}

runBenchmark().catch(console.error);
