import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash28");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let table = await connector.createTable("docs", [{ id: "1", text: "abc", vector: Array(1536).fill(0.1) }]);

    // In episodic.ts, `storeLedgerEntry` does this:
    // try { table = await createTable(..) } catch { table = await getTable(..); await table.add([..]) }
    // If it creates the table, it calls `invalidateTable`.
    // Then next time it calls `getTable` and gets the table, storing it in cache.
    const t2 = await connector.getTable("docs");

    // Now simulate end of test:
    fs.rmSync(dbPath, { recursive: true, force: true });

    // BUT episodic memory has a `withLock` call that creates the directory!
    await connector.withLock("default", async () => {
        // So dbPath exists!
        // And now `storeLedgerEntry` does THIS:
        const t3 = await connector.getTable("docs");
        console.log("t3 is cached?", t3 !== null); // YES! Because it was cached in previous test.

        try {
            await t3.add([{ id: "3", text: "def", vector: Array(1536).fill(0.1) }]);
            console.log("t3 add ok");
        } catch(e) {
            console.log("t3 add crashed", e.message);
        }

        try {
            const res = await t3.search(Array(1536).fill(0.1)).toArray();
            console.log("t3 search ok", res.length);
        } catch(e) {
            console.log("t3 search crashed", e.message);
        }
    });
}
main().catch(console.error);
