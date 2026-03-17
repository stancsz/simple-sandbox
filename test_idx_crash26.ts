import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash26");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    // Oh, look at `getConnection` in `LanceDBPool`
    // If it's already in `this.connections.has(dbPath)`, it just returns it!
    // AND if `this.connections` has it, it doesn't check `existsSync(dbPath)` inside `getConnection`.
    // Wait, in `getTable`:
    // if (!existsSync(dbPath)) { this.invalidateTable(dbPath, tableName); this.connections.delete(dbPath); return null; }
    // BUT what if `dbPath` was wiped, AND THEN recreated because something else called `getConnection`?
    // In EpisodicMemory:
    // `await connector.withLock(..., async () => { ... table = await connector.getTable("ledger_entries"); ... })`
    // `withLock` creates the lock dir inside `dbPath`!!!!
    // `const lockDir = join(this.dbPath, "locks"); await mkdir(lockDir, { recursive: true });`
    // SO `dbPath` IS CREATED by `withLock` BEFORE `getTable` is called!
    // Therefore `existsSync(dbPath)` is TRUE!
    // BUT the LanceDB table files are GONE!

    // Let's prove it!
    const connector = new LanceConnector(dbPath);
    let table = await connector.createTable("docs", [{ id: "1", text: "abc", vector: Array(1536).fill(0.1) }]);

    // delete dir
    fs.rmSync(dbPath, { recursive: true, force: true });

    // now we use withLock, which recreates dbPath
    await connector.withLock("comp", async () => {
        // getTable checks existsSync(dbPath). It's true because lock dir is inside it!
        const t2 = await connector.getTable("docs");
        try {
            await t2.search(Array(1536).fill(0.1)).toArray();
            console.log("t2 ok");
        } catch(e) {
            console.error("t2 crashed", e.message);
        }
    });
}
main().catch(console.error);
