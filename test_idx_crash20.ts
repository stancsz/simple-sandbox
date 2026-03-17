import { LanceConnector } from "./src/mcp_servers/brain/lance_connector.js";
import { resolve } from "path";
import * as fs from "fs";

async function main() {
    const dbPath = resolve(".agent/test_idx_crash20");
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath, { recursive: true, force: true });

    const connector = new LanceConnector(dbPath);
    let table = await connector.getTable("docs");

    // In our test failure: CompanyContextServer
    // The test adds 100 documents, which means the table has 100 documents.
    // That means `data.length >= 256` is false, and `rowCount >= 256` is false.
    // So index creation IS NOT EVEN RUN.
    // WAIT. If index creation is NOT run, why are we crashing with LanceDB `Not found`?

    // In `company_context.test.ts`:
    // It creates 100 files, then runs `load_company_context`.
    // Then it runs `query_company_context`.
    // It crashes inside `query_company_context` because "Not found".
    // Is it related to the cache?
    // `load_company_context` calls `getTable("documents")` then `add([data])` 100 times.
    // Wait, let's look at `lanceDBPool.getTable`

    for (let i = 0; i < 100; i++) {
        const data = { id: `doc_${i}`, text: "keyword-" + i, vector: Array(1536).fill(0.1) };
        if (i === 0) {
            table = await connector.createTable("docs", [data]);
        } else {
            await table.add([data]);
        }
    }

    // now we have 100 fragments.
    // `query_company_context` uses `getConnector(company_id)` then `getTable("documents")`
    const connector2 = new LanceConnector(dbPath);
    const table2 = await connector2.getTable("docs");

    try {
        const res = await table2.search(Array(1536).fill(0.1)).limit(10).toArray();
        console.log("table2 search ok", res.length);
    } catch(e) {
        console.error("table2 search crashed:", e.message);
    }
}
main().catch(console.error);
