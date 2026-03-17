import { LanceConnector, lanceDBPool } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash6");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);

    // Simulate EpisodicMemory flow
    // store(data)
    await connector.withLock("comp", async () => {
        let table = await connector.getTable("episodes");
        if (!table) {
            table = await connector.createTable("episodes", [{ id: "1", type: "x", vector: Array(1536).fill(0.1), metadata: "{}" }]);
        }
        await table.add([{ id: "2", type: "x", vector: Array(1536).fill(0.1), metadata: "{}" }]);
    });

    // recall(data)
    let res = await connector.withLock("comp", async () => {
        const table = await connector.getTable("episodes");
        return await table.search(Array(1536).fill(0.1)).toArray();
    });
    console.log("first recall:", res.length);

    // store more data so it passes 256
    let bulk = [];
    for(let i=3; i<300; i++) bulk.push({ id: `${i}`, type: "x", vector: Array(1536).fill(0.1), metadata: "{}" });

    await connector.withLock("comp", async () => {
        const table = await connector.getTable("episodes");
        await table.add(bulk);
        await connector.optimizeTable("episodes");
    });

    // recall again
    try {
        let res2 = await connector.withLock("comp", async () => {
            const table = await connector.getTable("episodes");
            return await table.search(Array(1536).fill(0.1)).limit(10).toArray();
        });
        console.log("second recall:", res2.length);
    } catch(e) {
        console.error("second recall crash:", e.message);
    }
}
main().catch(console.error);
