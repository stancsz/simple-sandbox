import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash3");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let data = [];
    for (let i = 0; i < 300; i++) {
        data.push({ id: `i_${i}`, vector: Array(1536).fill(0.1), type: "test" });
    }

    const t = await connector.createTable("my_table", data);

    data = [];
    for (let i = 300; i < 400; i++) {
        data.push({ id: `i_${i}`, vector: Array(1536).fill(0.1), type: "test" });
    }

    // simulate episodic memory storing a new item, opening the table via getTable and adding it.
    const tableViaGet = await connector.getTable("my_table");
    await tableViaGet.add(data);

    // In EpisodicMemory store():
    // it deletes, and adds, etc. In distributed ledger it updateLedgerEntry.
    // If it deletes:
    await tableViaGet.delete(`id = 'i_10'`);

    // Optimize might be run manually or by background
    // then when retrieving entries
    const searchRes = await tableViaGet.query().toArray();
    console.log("length of search:", searchRes.length);
}
main().catch(console.error);
