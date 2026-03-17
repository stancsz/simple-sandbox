import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash17");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let table = await connector.getTable("docs");

    const data = { id: `doc_first`, text: "keyword-first", vector: Array(1536).fill(0.1) };
    table = await connector.createTable("docs", [data]);

    const t2 = await connector.getTable("docs");

    // add 99 rows
    for (let i = 0; i < 99; i++) {
        await table.add([{ id: `doc_${i}`, text: "keyword-" + i, vector: Array(1536).fill(0.1) }]);
    }

    // now we have a table object that was added to 99 times.
    // Wait... if another process adds to the table, and this table object hasn't been re-fetched?

    // But in tests/company_context.test.ts, it uses `CompanyContextServer.load_company_context`.
    // It creates ONE connector, gets ONE table object, adds to it.
    // THEN, it queries using another `query_company_context` call, which creates ANOTHER connector,
    // gets the table (FROM THE LRU CACHE).
    // The LRU cache returns the SAME PROMISE that resolved to the SAME TABLE OBJECT.

    // Wait, why would LanceDB fail with "Not found" when querying a cached table object?
    // Let's optimize table
    try {
        await table.compactFiles();
        await table.cleanupOldVersions();
    } catch(e) {}

    try {
        const r = await t2.search(Array(1536).fill(0.1)).limit(10).toArray();
        console.log("ok", r.length);
    } catch(e) {
        console.error("error", e.message);
    }
}
main().catch(console.error);
