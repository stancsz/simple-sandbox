import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash19");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    const data = { id: `doc_first`, text: "keyword-first", vector: Array(1536).fill(0.1) };

    // In tests, distributed ledger creates table once, and adds to it.
    let table = await connector.createTable("docs", [data]);

    for (let i = 0; i < 300; i++) {
        await table.add([{ id: `doc_${i}`, text: "keyword-" + i, vector: Array(1536).fill(0.1) }]);
    }

    // Then `optimizeTable` is called
    await connector.optimizeTable("docs");

    // wait, what happens if we search NOW using the old `table` variable?
    try {
        const res = await table.search(Array(1536).fill(0.1)).limit(10).toArray();
        console.log("old table search ok", res.length);
    } catch(e) {
        console.error("old table search crashed:", e.message);
    }

    // what if we query?
    try {
        const res2 = await table.query().limit(10).toArray();
        console.log("old table query ok", res2.length);
    } catch(e) {
        console.error("old table query crashed:", e.message);
    }
}
main().catch(console.error);
