import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { LanceConnector } from "../../src/mcp_servers/brain/lance_connector.js";
import { performance } from "perf_hooks";

describe("LanceDB Multi-Tenant Scalability Validation", () => {
    const TEST_AGENT_DIR = join(process.cwd(), ".agent_perf_scalability_test");
    const NUM_TENANTS = 100;
    const DOCS_PER_TENANT = 256; // Minimum for IVF-PQ
    const QUERIES_PER_TENANT = 20;

    beforeAll(async () => {
        if (!existsSync(TEST_AGENT_DIR)) {
            await mkdir(TEST_AGENT_DIR, { recursive: true });
        }

        // Setup tenants and data
        const setupTasks = [];
        for (let i = 0; i < NUM_TENANTS; i++) {
            setupTasks.push(async () => {
                const companyId = `scalability-company-${i}`;
                const dbPath = join(TEST_AGENT_DIR, "companies", companyId, "brain");

                const connector = new LanceConnector(dbPath);
                await connector.withLock("default", async () => {
                    const data = [];
                    for (let j = 0; j < DOCS_PER_TENANT; j++) {
                        const content = `Scalability doc ${j} for company ${i}.`;
                        const hash = content.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) + (j * 17);
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
            });
        }

        // Wait for all setups to complete
        // To avoid EMFILE on slower CI runners, process in batches of 20
        for (let i = 0; i < setupTasks.length; i += 20) {
            await Promise.all(setupTasks.slice(i, i + 20).map(task => task()));
        }
    }, 120000); // Allow 2 minutes for massive setup

    afterAll(async () => {
        if (!process.env.KEEP_TEST_DATA && existsSync(TEST_AGENT_DIR)) {
            await rm(TEST_AGENT_DIR, { recursive: true, force: true });
        }
    });

    it("should maintain p99 latency under 2000ms for 100 concurrent tenants using batch optimizations", async () => {
        const startMem = process.memoryUsage().heapUsed;
        const startTime = performance.now();

        const latencies: number[] = [];
        const queryPromises = [];

        for (let i = 0; i < NUM_TENANTS; i++) {
            const companyId = `scalability-company-${i}`;
            const dbPath = join(TEST_AGENT_DIR, "companies", companyId, "brain");
            const connector = new LanceConnector(dbPath);

            const vectors = [];
            for (let q = 0; q < QUERIES_PER_TENANT; q++) {
                 const qStr = `Query ${q} for company ${i}`;
                 const hash = qStr.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
                 vectors.push(new Array(1536).fill(0).map((_, k) => ((hash * (k + 1)) % 1000) / 1000));
            }

            queryPromises.push((async () => {
                 const qStart = performance.now();

                 await connector.batchQuery("documents", vectors, 3);

                 const qEnd = performance.now();
                 // Average batch latency per logical query
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
        const p99 = latencies[Math.floor(latencies.length * 0.99)];
        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

        const qps = (latencies.length / (endTime - startTime)) * 1000;
        const memMB = (endMem - startMem) / 1024 / 1024;

        console.log(`\n--- Scalability Test Results ---`);
        console.log(`p99 Latency: ${p99.toFixed(2)} ms`);
        console.log(`Avg Latency: ${avg.toFixed(2)} ms`);
        console.log(`Throughput: ${qps.toFixed(2)} QPS`);
        console.log(`Memory Delta: ${memMB.toFixed(2)} MB`);
        console.log(`--------------------------------\n`);

        expect(p99).toBeLessThan(2000);
        expect(avg).toBeLessThan(1000);
        // Ensure some throughput
        expect(qps).toBeGreaterThan(50);
    }, 60000);
});
