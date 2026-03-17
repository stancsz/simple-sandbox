import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash18");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let table = await connector.getTable("docs");

    const data = { id: `doc_first`, text: "keyword-first", vector: Array(1536).fill(0.1) };
    table = await connector.createTable("docs", [data]);

    const t2 = await connector.getTable("docs");

    // add 100 rows, this creates multiple fragments
    for (let i = 0; i < 100; i++) {
        await t2.add([{ id: `doc_${i}`, text: "keyword-" + i, vector: Array(1536).fill(0.1) }]);
    }

    // now we have a cached table object t2.
    // LanceDB node sdk caches the fragment metadata inside the table object?
    // Wait... if you call t2.search(), it reads all fragments.
    // If you call t2.optimize() or table.compactFiles() on another process, the fragments are deleted, but t2 still tries to read them!
    // But we are in the same process, using the same t2 object.

    // The test in `distributed_ledger_validation.ts` has multiple tests running concurrently?
    // Vitest runs test files in parallel. But `distributed_ledger_validation.ts` has 3 tests inside one `describe`. Vitest runs them sequentially unless `.concurrent` is used.

    // Let's manually trigger `createVectorIndex` and `createMetadataIndex` on the table.

    // The error: `Failed to get next batch from stream: lance error: Not found: ...`
    // This happens specifically when the `table` object is reading old lance files that are gone.
    // Why are they gone?
    // In `distributed_ledger_validation.ts`:
    // It updates ledger entries: `await table.delete(id); await table.add([entry]);`
    // If we delete and add, it creates new fragments and versions. Does it delete old files?
    // No, LanceDB keeps old files until `cleanupOldVersions()` is called.

    // Unless... the cache invalidation is missing for `optimizeTable` or `createVectorIndex`?
}
main().catch(console.error);
