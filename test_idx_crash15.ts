import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";
import * as lancedb from "@lancedb/lancedb";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash15");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let data = [];
    for (let i = 0; i < 300; i++) {
        data.push({ id: `i_${i}`, vector: Array(1536).fill(Math.random()), type: "test" });
    }

    const table = await connector.createTable("my_table", data);
    const db = await lancedb.connect(dbPath);
    const extTbl = await db.openTable("my_table");

    await connector.optimizeTable("my_table");

    // Now if we have cached table...
    const t2 = await connector.getTable("my_table");

    // then the external process updates table
    await extTbl.delete(`id = 'i_10'`);
    await extTbl.add([{ id: `i_10`, vector: Array(1536).fill(0.1), type: "mod" }]);

    // now we use t2 to search
    try {
        const r = await t2.search(Array(1536).fill(0.1)).limit(10).toArray();
        console.log("ok", r.length);
    } catch(e) {
        console.error("error", e.message);
    }
}
main().catch(console.error);
