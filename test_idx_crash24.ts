import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash24");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let table = await connector.createTable("docs", [{ id: "1", text: "abc", vector: Array(1536).fill(0.1) }]);

    // In `distributed_ledger_validation.ts`, there are MULTIPLE async operations happening.
    // wait, distributed ledger tests don't run in parallel for a single describe block, do they?
    // Let's check:
}
main().catch(console.error);
