import { LanceConnector } from "../src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";

async function runProfile() {
    const dbPath = resolve(".agent/profile_lancedb");
    if (fs.existsSync(dbPath)) {
        fs.rmSync(dbPath, { recursive: true, force: true });
    }

    const connector = new LanceConnector(dbPath);
    console.log("Creating tables for 20 tenants...");

    const numTenants = 20;
    const recordsPerTenant = 500;
    const dim = 1536;

    const createPromises = Array.from({ length: numTenants }, async (_, i) => {
        const tenantData = [];
        for (let j = 0; j < recordsPerTenant; j++) {
            tenantData.push({
                id: `t${i}_${j}`,
                vector: Array.from({ length: dim }, () => Math.random()),
                type: j % 2 === 0 ? "plan" : "result",
                metadata: JSON.stringify({ tenant: i, timestamp: Date.now() })
            });
        }
        await connector.createTable(`tenant_${i}`, tenantData);
    });
    await Promise.all(createPromises);

    console.log("Running concurrent queries...");
    const numQueries = 1000;

    // Force garbage collection if available
    if (global.gc) {
        global.gc();
    }

    const startMemory = process.memoryUsage().heapUsed;
    const startTime = performance.now();

    const queryPromises = Array.from({ length: numQueries }, async (_, idx) => {
        const tId = idx % numTenants;
        const table = await connector.getTable(`tenant_${tId}`);
        if (!table) return;
        const vector = Array.from({ length: dim }, () => Math.random());
        // search + metadata filtering
        const results = await table.search(vector)
            .where(`type = 'plan'`)
            .select(["id", "type"])
            .limit(5)
            .toArray();
        return results.length;
    });

    await Promise.all(queryPromises);

    const endTime = performance.now();
    const endMemory = process.memoryUsage().heapUsed;

    const latency = endTime - startTime;
    const memUsed = (endMemory - startMemory) / 1024 / 1024;

    console.log(`\n=== Performance Profile ===`);
    console.log(`Total Queries: ${numQueries}`);
    console.log(`Concurrent Tenants: ${numTenants}`);
    console.log(`Records per Tenant: ${recordsPerTenant}`);
    console.log(`---------------------------`);
    console.log(`Total Latency: ${latency.toFixed(2)} ms`);
    console.log(`Average Latency: ${(latency / numQueries).toFixed(2)} ms/query`);
    console.log(`Memory Usage Delta: ${memUsed.toFixed(2)} MB`);

    fs.writeFileSync("profile_results_after.json", JSON.stringify({ latency, memUsed, avgLatency: latency / numQueries }, null, 2));
}

runProfile().catch(console.error);
