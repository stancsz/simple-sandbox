import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    const data = [];
    for (let i = 0; i < 300; i++) {
        data.push({ id: `i_${i}`, vector: Array(1536).fill(0.1), type: "test" });
    }

    const t = await connector.createTable("my_table", data);

    // now we read
    const results = await t.search(Array(1536).fill(0.1)).limit(2).toArray();
    console.log(results.length);
}
main().catch(console.error);
