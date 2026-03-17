import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";
import * as lancedb from "@lancedb/lancedb";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash8");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let data = [];
    for (let i = 0; i < 300; i++) {
        data.push({ id: `i_${i}`, vector: Array(1536).fill(Math.random()), text: "doc-" + i });
    }

    const t = await connector.createTable("my_table", data);

    // add more
    const data2 = [];
    for (let i = 0; i < 10; i++) {
        data2.push({ id: `i_new_${i}`, vector: Array(1536).fill(0.1), text: "doc-" + i });
    }
    await t.add(data2);

    await connector.optimizeTable("my_table");

    // fetch using a completely separate connection
    const db = await lancedb.connect(dbPath);
    const tbl = await db.openTable("my_table");

    try {
        const searchRes = await tbl.search(Array(1536).fill(0.1)).limit(2).toArray();
        console.log("direct ok", searchRes.length);
    } catch(e) {
        console.error("direct failed", e.message);
    }

    // now try reading from the CACHED table inside connector
    try {
        const cachedTbl = await connector.getTable("my_table");
        const res2 = await cachedTbl.search(Array(1536).fill(0.1)).limit(2).toArray();
        console.log("cached ok", res2.length);
    } catch(e) {
        console.error("cached failed", e.message);
    }
}
main().catch(console.error);
