import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";
import * as lancedb from "@lancedb/lancedb";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash9");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let data = [];
    for (let i = 0; i < 50; i++) {
        data.push({ id: `i_${i}`, vector: Array(1536).fill(Math.random()), text: "doc-" + i });
    }

    const t = await connector.createTable("my_table", data);

    // now we append a lot of data. In company_context: we gettable, then add.
    let bulk = [];
    for(let i=50; i<350; i++) {
        bulk.push({ id: `i_${i}`, vector: Array(1536).fill(0.1), text: "doc-" + i });
    }

    const t_cached = await connector.getTable("my_table");
    await t_cached.add(bulk); // Table has now 350

    // episodic memory does not explicitly call optimizeTable after store, it only calls it randomly.
    // BUT what happens if it calls delete() then add()?
    await t_cached.delete(`id = 'i_10'`);
    await t_cached.add([{ id: `i_new_10`, vector: Array(1536).fill(0.1), text: "doc-10-mod" }]);

    // then query
    try {
        const searchRes = await t_cached.search(Array(1536).fill(0.1)).limit(2).toArray();
        console.log("cached ok", searchRes.length);
    } catch(e) {
        console.error("cached failed", e.message);
    }
}
main().catch(console.error);
