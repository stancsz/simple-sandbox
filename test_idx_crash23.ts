import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash23");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let table = await connector.createTable("docs", [{ id: "1", text: "abc", vector: Array(1536).fill(0.1) }]);

    // Oh, createTable invalidates the table from cache immediately!!!
    // So the cache does NOT have it.
    // When the NEXT code calls getTable(), it creates a new promise in the cache, which successfully opens the table!

    // Then we add to it...
    const t2 = await connector.getTable("docs");
    await t2.add([{ id: "2", text: "def", vector: Array(1536).fill(0.1) }]);

    // Now simulate end of test:
    fs.rmSync(dbPath, { recursive: true, force: true });

    // Now simulate NEXT test that tries to call getTable("docs") directly!
    // Since t2 was opened successfully, it is STILL IN THE CACHE!
    const t3 = await connector.getTable("docs");

    console.log("t3 === t2 ?", t3 === t2);

    // So if the next test tries to search it:
    try {
        await t3.search(Array(1536).fill(0.1)).limit(1).toArray();
        console.log("t3 search ok");
    } catch(e) {
        console.error("t3 search crashed", e.message);
    }
}
main().catch(console.error);
