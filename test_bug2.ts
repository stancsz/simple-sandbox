import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_bug2");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let table = await connector.getTable("documents");

    // now we loop to 300, triggering optimize maybe?
    for (let i = 0; i < 300; i++) {
        const data = {
            id: `doc_${i}`,
            content: "keyword-" + i,
            source: "path/" + i,
            vector: Array(1536).fill(0.1),
        };
        if (!table) {
            table = await connector.createTable("documents", [data]);
        } else {
            await table.add([data]);
        }
    }

    console.log("added all");
    // episodic memory does not explicitly optimizeTable, but company_context doesn't either!
    // company_context JUST adds!
    const t2 = await connector.getTable("documents");
    try {
        const r = await t2.search(Array(1536).fill(0.1)).limit(10).toArray();
        console.log("ok", r.length);
    } catch(e) {
        console.error("error", e.message);
    }
}
main().catch(console.error);
