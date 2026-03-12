import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "dotenv";
import { join } from "path";
import { existsSync } from "fs";
import { registerEvaluateStrategicPivot } from "./tools/evaluate_strategic_pivot.js";
import { registerExecuteAutonomousDecision } from "./tools/execute_autonomous_decision.js";
import { registerMonitorDecisionOutcomes } from "./tools/monitor_decision_outcomes.js";

// Load secrets from .env.agent
const envPath = join(process.cwd(), ".env.agent");
if (existsSync(envPath)) {
  config({ path: envPath });
}

// Initialize Server
const server = new McpServer({
  name: "strategic_decision",
  version: "1.0.0",
});

// Register Tools
registerEvaluateStrategicPivot(server);
registerExecuteAutonomousDecision(server);
registerMonitorDecisionOutcomes(server);

// Start Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Strategic Decision MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
