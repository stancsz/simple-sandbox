import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash4");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let data = [];
    for (let i = 0; i < 300; i++) {
        data.push({ id: `i_${i}`, vector: Array(1536).fill(Math.random()), type: "test" });
    }

    const t = await connector.createTable("my_table", data);

    // Test the createMetadataIndex logic explicitly
    // If we add data, then index, then search...
    await t.add([{ id: "hello", vector: Array(1536).fill(0.2), type: "test" }]);

    await connector.createMetadataIndex(t);

    // do a search
    try {
        const searchRes = await t.search(Array(1536).fill(0.2)).where(`id = 'hello'`).toArray();
        console.log("length of search:", searchRes.length);
    } catch(e) {
        console.error("search crashed", e);
    }
}
main().catch(console.error);
