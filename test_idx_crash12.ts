import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash12");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let data = [];
    for (let i = 0; i < 300; i++) {
        data.push({ id: `i_${i}`, vector: Array(1536).fill(Math.random()), type: "test" });
    }

    const table = await connector.createTable("my_table", data);

    // update: read, delete, add
    const results = await table.query().where(`id = 'i_10'`).toArray();
    const entry = results[0];

    await table.delete(`id = 'i_10'`);
    await table.add([{ id: `i_10`, vector: Array(1536).fill(0.1), type: "mod" }]);

    // search
    const t2 = await connector.getTable("my_table");
    try {
        const r = await t2.search(Array(1536).fill(0.1)).limit(10).toArray();
        console.log("ok", r.length);
    } catch(e) {
        console.error("error", e.message);
    }
}
main().catch(console.error);
