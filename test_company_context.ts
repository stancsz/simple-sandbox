import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";
import { randomUUID } from "crypto";

async function main() {
    const dbPath = resolve(".agent/test_company_context");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);

    // In CompanyContext.store():
    // await this.table!.add([ { id: randomUUID(), text, vector, metadata } ])
    const data = [];
    for(let i=0; i<105; i++) {
        data.push({
            id: randomUUID(),
            text: "keyword-" + i,
            vector: Array(1536).fill(Math.random()),
            metadata: JSON.stringify({ index: i })
        });
    }

    const table = await connector.createTable("documents", data.slice(0, 50));
    await table.add(data.slice(50));

    // Now search
    const results = await table.search(Array(1536).fill(0.1)).limit(10).toArray();
    console.log("length:", results.length);
}
main().catch(console.error);
