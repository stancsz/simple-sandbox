import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash5");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let data = [];
    for (let i = 0; i < 300; i++) {
        data.push({ id: `i_${i}`, vector: Array(1536).fill(Math.random()), type: "test" });
    }

    // table caches
    const t = await connector.createTable("my_table", data);

    // Now simulate we write via table directly? Or via getTable
    const t2 = await connector.getTable("my_table");

    await t2.add([{ id: "hello", vector: Array(1536).fill(0.2), type: "test" }]);

    // if I do optimizeTable, it will createIndex
    await connector.optimizeTable("my_table");

    // now read from t2
    try {
        const searchRes = await t2.search(Array(1536).fill(0.2)).limit(2).toArray();
        console.log("t2 ok", searchRes.length);
    } catch(e) {
        console.error("t2 failed", e.message);
    }
}
main().catch(console.error);
