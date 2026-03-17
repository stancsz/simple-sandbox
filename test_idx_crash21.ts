import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash21");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    // Vitest runs beforeEach, removing the directory, then creating it.
    // THEN it runs `it("should ingest and query")` ...
    // Wait, CompanyContextServer is used in MULTIPLE TESTS!
    // In `beforeEach`: `await rm(testRoot, { recursive: true, force: true });`
    // And in `afterEach`: `await rm(testRoot, ...)`

    // If the database is deleted on disk, but `lanceDBPool` (which is GLOBAL) still has the table cached in memory?!
    // YES! `lanceDBPool` is a global constant!
    // `export const lanceDBPool = new LanceDBPool();`
    // If `rm(testRoot)` happens, the files are gone!
    // But `lanceDBPool.getTable` still returns the old `table` promise that refers to the old files!
    // And when you call `.search()` on it, LanceDB tries to read the old file paths and crashes with "Not found".

    // Let's prove this.
    const connector = new LanceConnector(dbPath);
    let table = await connector.createTable("docs", [{ id: "1", text: "abc", vector: Array(1536).fill(0.1) }]);

    // Now simulate end of test: delete dir
    fs.rmSync(dbPath, { recursive: true, force: true });

    // Now simulate next test: it tries to create new table?
    // In next test, `load_company_context` is called.
    // It calls `getTable("documents")`
    const t2 = await connector.getTable("docs");
    // t2 will NOT be null because it's cached!
    console.log("t2 is cached?", t2 !== null);

    // Then it tries to add to it...
    try {
        await t2.add([{ id: "2", text: "def", vector: Array(1536).fill(0.1) }]);
    } catch(e) {
        console.log("add failed", e.message);
    }

    // Or it does `createTable` again.
}
main().catch(console.error);
