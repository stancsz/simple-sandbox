import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash14");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let data = [];
    for (let i = 0; i < 300; i++) {
        data.push({ id: `i_${i}`, vector: Array(1536).fill(Math.random()), type: "test" });
    }

    // In our test failure, it creates a table concurrently.
    const table = await connector.createTable("my_table", data);

    await connector.optimizeTable("my_table");

    // Now if we have cached table...
    const t2 = await connector.getTable("my_table");

    // Then another query from another process does a delete and add (idempotency updates)
    await table.delete(`id = 'i_10'`);
    await table.add([{ id: `i_10`, vector: Array(1536).fill(0.1), type: "mod" }]);

    // now we use t2 to search
    try {
        const r = await t2.search(Array(1536).fill(0.1)).limit(10).toArray();
        console.log("ok", r.length);
    } catch(e) {
        console.error("error", e.message);
    }
}
main().catch(console.error);
