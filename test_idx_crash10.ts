import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash10");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let table = await connector.getTable("documents");

    // now we loop to 100
    for (let i = 0; i < 100; i++) {
        const data = {
            id: `doc_${i}`,
            text: "keyword-" + i,
            vector: Array(1536).fill(0.1),
        };
        if (!table) {
            table = await connector.createTable("documents", [data]);
        } else {
            await table.add([data]);
        }
    }

    console.log("added all");
    const t2 = await connector.getTable("documents");
    try {
        const r = await t2.search(Array(1536).fill(0.1)).limit(10).toArray();
        console.log("ok", r.length);
    } catch(e) {
        console.error("error", e.message);
    }
}
main().catch(console.error);
