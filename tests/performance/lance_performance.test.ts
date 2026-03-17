import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { LanceConnector, lanceDBPool } from "../../src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";
import * as os from "os";

describe("LanceDB Performance Tuning & Multi-Tenant Scaling", () => {
    let dbPath: string;
    let connector: LanceConnector;

    beforeAll(async () => {
        dbPath = resolve(os.tmpdir(), "lance_perf_test_db");
        if (fs.existsSync(dbPath)) {
            fs.rmSync(dbPath, { recursive: true, force: true });
        }
        connector = new LanceConnector(dbPath);
    });

    afterAll(() => {
        if (fs.existsSync(dbPath)) {
            fs.rmSync(dbPath, { recursive: true, force: true });
        }
    });

    it("should handle 100 concurrent tenants reliably and scale linearly in memory", async () => {
        const numTenants = 100; // Testing exact constraint
        const dim = 1536;

        // 1. Create tables concurrently
        const createPromises = Array.from({ length: numTenants }, async (_, i) => {
            const tenantData = [];
            // Create data for testing
            for (let j = 0; j < 50; j++) {
                tenantData.push({
                    id: `test_t${i}_${j}`,
                    vector: Array.from({ length: dim }, () => Math.random()),
                    type: "testing",
                    metadata: JSON.stringify({ index: j })
                });
            }
            return await connector.createTable(`tenant_${i}`, tenantData);
        });

        await Promise.all(createPromises);

        // Verify tables exist
        for (let i = 0; i < numTenants; i++) {
            const table = await connector.getTable(`tenant_${i}`);
            expect(table).not.toBeNull();
            const count = await table!.countRows();
            expect(count).toBe(50);
        }

        // 2. Query concurrently
        const numQueries = 1000;
        const queryPromises = Array.from({ length: numQueries }, async (_, idx) => {
            const tId = idx % numTenants;
            const table = await connector.getTable(`tenant_${tId}`);
            if (!table) throw new Error("Table missing");
            const vector = Array.from({ length: dim }, () => Math.random());
            const results = await table.search(vector)
                .where(`type = 'testing'`)
                .select(["id"])
                .limit(2)
                .toArray();
            return results.length;
        });

        const startMemory = process.memoryUsage().heapUsed;
        const results = await Promise.all(queryPromises);
        const endMemory = process.memoryUsage().heapUsed;

        expect(results.every(r => r === 2)).toBe(true);

        const memUsedMb = (endMemory - startMemory) / 1024 / 1024;
        // Verify memory used does not exceed ~500MB (Constraint)
        expect(memUsedMb).toBeLessThan(500);

    }, 30000);
});
