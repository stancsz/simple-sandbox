import { LanceConnector, lanceDBPool } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash16");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let data = [];
    for (let i = 0; i < 300; i++) {
        data.push({ id: `i_${i}`, vector: Array(1536).fill(Math.random()), type: "test" });
    }

    // In our tests, we use `connector.createTable`, which caches the table instance.
    const table = await connector.createTable("my_table", data);

    // BUT what if we use the table to add data, then someone else overwrites the entire table?
    // We didn't do that.

    // wait, what if the data length is < 256?
    const dataSmall = [];
    for (let i = 0; i < 50; i++) {
        dataSmall.push({ id: `i_${i}`, vector: Array(1536).fill(Math.random()), type: "test" });
    }
    await connector.createTable("small_table", dataSmall);
    const smallTable = await connector.getTable("small_table");

    // In company_context.test.ts:
    // we createTable with 1 doc, then we loop 99 times and add 1 doc each.
    // wait, in the performance test:
    // for (let i = 0; i < 100; i++) ... writeFile...
    // then `load_company_context` reads all 100 files, and then calls createTable on the first, and add on the rest.
    // So it adds 99 times.
    // Total count is 100 docs. < 256.

    // Then we query!
    const res = await smallTable.search(Array(1536).fill(0.1)).toArray();
    console.log("small res", res.length);

    // Let's look at the error again:
    // "Failed to get next batch from stream: lance error: Not found: home/.../data/xxx.lance"
    // This happens when LanceDB tries to read a fragment file that doesn't exist.
    // Why would a fragment file not exist?
    // - Compaction happened and deleted it?
    // - The table object is stale and holds a reference to a deleted fragment?
}
main().catch(console.error);
