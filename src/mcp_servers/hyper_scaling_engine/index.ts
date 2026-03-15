import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerHyperScalingTools } from "./tools.js";

const server = new McpServer({
    name: "hyper_scaling_engine",
    version: "1.0.0",
});

registerHyperScalingTools(server);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Hyper Scaling Engine MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
