import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash27");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let table = await connector.createTable("docs", [{ id: "1", text: "abc", vector: Array(1536).fill(0.1) }]);

    // delete dir
    fs.rmSync(dbPath, { recursive: true, force: true });
    fs.mkdirSync(dbPath, { recursive: true });

    // In `distributed_ledger_validation`:
    // It creates `EpisodicMemory`, calls `init()` which doesn't do much.
    // Then it calls `recordTransaction` which calls `episodic.storeLedgerEntry`.
    // Inside `storeLedgerEntry`:
    // `const connector = await this.getConnector(company);`
    // `await connector.withLock(company, async () => { ... })`
    // The lock directory is created. `existsSync(dbPath)` is true.
    // `getTable("ledger_entries")` is called.
    // Inside `getTable`, `existsSync(dbPath)` is true.
    // The cache STILL has the key for `ledger_entries` from the PREVIOUS test (because the cache is global).
    // So it RETURNS THE CACHED TABLE OBJECT.

    // WAIT. If it returns the cached table object, why did my previous script `t2 crashed Cannot read properties of null`?
    // Because in my script, `getTable("docs")` returns the Promise that resolves to the table object.

    // Let's re-verify.
    const t2 = await connector.getTable("docs");
    console.log("is t2 cached?", t2 !== null);

    try {
        await t2.search(Array(1536).fill(0.1)).toArray();
    } catch(e) {
        console.error("t2 search failed:", e.message);
    }
}
main().catch(console.error);
