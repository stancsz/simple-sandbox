import { join } from "path";
import * as fs from "fs/promises";
import { existsSync } from "fs";

async function main() {
    const data = await import("./src/mcp_servers/health_monitor/utils.js");
    const logDir = join(process.cwd(), ".agent_test_dashboard", "ecosystem_logs");
    let events: any[] = [];
    console.log("logDir:", logDir);
    if (existsSync(logDir)) {
        console.log("logDir exists");
        const files = await data.getMetricFiles(logDir);
        console.log("files:", files);
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
        for (const file of jsonlFiles) {
             const logs = await data.readNdjson(file);
             events.push(...logs);
        }
    }
    console.log("events:", events);
}
main();
