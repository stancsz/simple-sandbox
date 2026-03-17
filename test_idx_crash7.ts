import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash7");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let data = [];
    for (let i = 0; i < 260; i++) {
        data.push({ id: `i_${i}`, vector: Array(1536).fill(Math.random()), type: "test" });
    }

    // table caches
    const t = await connector.createTable("my_table", data);

    // Write using add
    await t.add([{ id: "hello", vector: Array(1536).fill(0.2), type: "test" }]);

    const t2 = await connector.getTable("my_table");

    // now read from t2
    try {
        const searchRes = await t2.search(Array(1536).fill(0.2)).limit(2).toArray();
        console.log("t2 ok", searchRes.length);
    } catch(e) {
        console.error("t2 failed", e.message);
    }
}
main().catch(console.error);
