import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash22");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let table = await connector.createTable("docs", [{ id: "1", text: "abc", vector: Array(1536).fill(0.1) }]);

    // Now simulate end of test: delete dir
    fs.rmSync(dbPath, { recursive: true, force: true });

    // In next test, it calls load_company_context which checks if dir exists, then recreates it by calling getTable.
    // wait, if getTable is called, it returns NULL? Let's check:
    const t2 = await connector.getTable("docs");
    console.log("t2 is cached?", t2 !== null);
    // OH! In `LanceDBPool.getTable`, the first time it creates a PROMISE and sets it in the cache!
    // It returns the SAME table Promise! It will NOT return null if it was created successfully before.

    // Let me check my previous test where it returned null. Ah, because I didn't await it properly?
    try {
        await t2.add([{ id: "2", text: "def", vector: Array(1536).fill(0.1) }]);
    } catch(e) {
        console.log("add failed", e.message);
    }
}
main().catch(console.error);
