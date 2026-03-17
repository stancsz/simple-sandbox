import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash2");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let data = [];
    for (let i = 0; i < 300; i++) {
        data.push({ id: `i_${i}`, vector: Array(1536).fill(0.1), type: "test" });
    }

    // creating table caches the table in LRU cache
    const t = await connector.createTable("my_table", data);

    // then write another batch causing optimize to run
    data = [];
    for (let i = 300; i < 400; i++) {
        data.push({ id: `i_${i}`, vector: Array(1536).fill(0.1), type: "test" });
    }
    await t.add(data);

    // Wait for the cache invalidation to occur
    await connector.optimizeTable("my_table");

    // In our code optimizeTable does NOT invalidate cache, but it creates indexes.

    // read using getTable (fetches from cache if available)
    try {
        const tableViaGet = await connector.getTable("my_table");
        const results = await tableViaGet.search(Array(1536).fill(0.1)).limit(2).toArray();
        console.log("direct table ok:", results.length);
    } catch(e) {
        console.error("Crash direct via get", e.message);
    }
}
main().catch(console.error);
