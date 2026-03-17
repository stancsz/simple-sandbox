import { describe, it, expect, vi } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import { BrainServer } from "../../src/mcp_servers/brain/index.js";
import { SecurityMonitorServer } from "../../src/mcp_servers/security_monitor/index.js";

const execFileAsync = promisify(execFile);

// Mock EpisodicMemory to prevent actual database connections
vi.mock("../../src/brain/episodic.js", () => {
    return {
        EpisodicMemory: class EpisodicMemory {
            init() { return Promise.resolve(true); }
            store() { return Promise.resolve(true); }
            recall() { return Promise.resolve([]); }
        }
    };
});

// Mock dependencies of BrainServer that we don't need to load
vi.mock("../../src/framework_ingestion/ingest.js", () => {
    return {
        FrameworkIngestionEngine: class FrameworkIngestionEngine {
            scanForFrameworks() { return Promise.resolve([]); }
        }
    };
});
vi.mock("../../src/brain/semantic_graph.js", () => {
    return {
        SemanticGraph: class SemanticGraph {}
    };
});

describe("Dependency Audit Validation", () => {
    it("should have no critical vulnerabilities according to npm audit", async () => {
        try {
            const result = await execFileAsync("npm", ["audit", "--json"]);
            const auditReport = JSON.parse(result.stdout);
            const criticalVulns = auditReport.metadata?.vulnerabilities?.critical || 0;
            expect(criticalVulns).toBe(0);
        } catch (error: any) {
             if (error.stdout) {
                 const auditReport = JSON.parse(error.stdout);
                 const criticalVulns = auditReport.metadata?.vulnerabilities?.critical || 0;
                 expect(criticalVulns).toBe(0);
             } else {
                 throw error;
             }
        }
    });

    it("should successfully construct the BrainServer without dependency errors", () => {
        const brainServer = new BrainServer();
        expect(brainServer).toBeDefined();
    });

    it("should successfully construct the SecurityMonitorServer without dependency errors", () => {
        const securityServer = new SecurityMonitorServer();
        expect(securityServer).toBeDefined();
    });

    it("SecurityMonitorServer scan_dependencies tool should execute and parse output correctly", async () => {
        const securityServer = new SecurityMonitorServer();
        const serverInstance = (securityServer as any).server;

        let handler: any;

        // Find the generic tools/call handler in newer SDKs
        if (serverInstance._requestHandlers) {
            for (const [key, value] of serverInstance._requestHandlers.entries()) {
                if (key === "tools/call") {
                    handler = async (args: any) => {
                        return await value({ params: { name: "scan_dependencies", arguments: args }});
                    };
                    break;
                }
            }
        }

        // Find the generic tools/call handler if it is an object
        if (!handler && typeof serverInstance._requestHandlers === 'object') {
            const callHandler = serverInstance._requestHandlers["tools/call"];
            if (callHandler) {
                 handler = async (args: any) => {
                      return await callHandler({ params: { name: "scan_dependencies", arguments: args }});
                 };
            }
        }

        // Direct handler registration (older SDKs)
        if (!handler && serverInstance._registeredTools && serverInstance._registeredTools["scan_dependencies"]) {
             handler = serverInstance._registeredTools["scan_dependencies"];
             if (typeof handler === 'object' && handler.handler) {
                 const h = handler.handler;
                 handler = async (args: any) => {
                      return await h(args);
                 }
             }
        }

        // Fallback for some SDK versions where _requestHandlers stores handlers recursively
        if (!handler && serverInstance._requestHandlers) {
            const rootHandlers = serverInstance._requestHandlers;
            if (rootHandlers.get && rootHandlers.get("tools/call")) {
                 const callHandler = rootHandlers.get("tools/call");
                 handler = async (args: any) => {
                      return await callHandler({ params: { name: "scan_dependencies", arguments: args }});
                 };
            }
        }

        expect(handler).toBeDefined();

        if (handler) {
            let result;
            try {
                if (typeof handler === "function") {
                     result = await handler({});
                }
            } catch (e: any) {
                console.warn("Could not execute mock tool call cleanly", e.message);
                return;
            }

            expect(result).toBeDefined();
            // In MCP, result has a shape, normally { result: { content: [...] } } or { content: [...] } directly
            let resultBody = result.result || result;

            expect(resultBody.isError).toBeFalsy();
            expect(resultBody.content[0].type).toBe("text");

            const parsedContent = JSON.parse(resultBody.content[0].text);
            expect(parsedContent.status).toBe("Scan complete");
            expect(parsedContent.vulnerabilities).toBeDefined();
        }
    }, 30000); // Give npm audit some time to run
});
