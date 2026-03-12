import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDemandPredictionTools } from '../../src/mcp_servers/business_ops/tools/demand_prediction.js';

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
    return {
        Client: vi.fn().mockImplementation(() => {
            return {
                connect: vi.fn().mockResolvedValue(undefined),
                close: vi.fn().mockResolvedValue(undefined),
                callTool: vi.fn().mockImplementation(async (args) => {
                    if (args.name === 'list_metric_series') {
                        return {
                            isError: false,
                            content: [{ text: JSON.stringify(['api_calls_per_day', 'active_swarms']) }]
                        };
                    } else if (args.name === 'get_metric_points') {
                        if (args.arguments.metric_name === 'api_calls_per_day') {
                            const now = Date.now();
                            const MS_PER_DAY = 1000 * 60 * 60 * 24;
                            // Synthetic upward trend
                            return {
                                isError: false,
                                content: [{
                                    text: JSON.stringify([
                                        { timestamp: new Date(now - 3 * MS_PER_DAY).toISOString(), value: 100 },
                                        { timestamp: new Date(now - 2 * MS_PER_DAY).toISOString(), value: 200 },
                                        { timestamp: new Date(now - 1 * MS_PER_DAY).toISOString(), value: 300 }
                                    ])
                                }]
                            };
                        } else if (args.arguments.metric_name === 'active_swarms') {
                            const now = Date.now();
                            const MS_PER_DAY = 1000 * 60 * 60 * 24;
                            return {
                                isError: false,
                                content: [{
                                    text: JSON.stringify([
                                        { timestamp: new Date(now - 3 * MS_PER_DAY).toISOString(), value: 1 },
                                        { timestamp: new Date(now - 2 * MS_PER_DAY).toISOString(), value: 1 },
                                        { timestamp: new Date(now - 1 * MS_PER_DAY).toISOString(), value: 2 }
                                    ])
                                }]
                            };
                        }
                    }
                    return { isError: true, content: [{ text: "Tool not mocked" }] };
                })
            };
        })
    };
});

describe('Demand Prediction Validation', () => {
    let server: McpServer;

    beforeEach(() => {
        server = new McpServer({
            name: "test-business-ops",
            version: "1.0.0"
        });
        registerDemandPredictionTools(server);
    });

    it('should forecast resource demand and map to rules correctly', async () => {
        // Find the registered tool
        const toolReg = (server as any)._registeredTools || (server as any).tools;
        const toolMap = toolReg instanceof Map ? toolReg : new Map(Object.entries(toolReg || {}));
        const demandTool = toolReg['forecast_resource_demand'] || toolMap.get('forecast_resource_demand');

        expect(demandTool).toBeDefined();

        // Call the tool with 90 days horizon
        const result = await demandTool.handler({ horizon_days: 90, company: "test-company" });

        expect(result).toBeDefined();
        expect(result.content[0].type).toBe("text");

        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.status).toBe("success");
        expect(parsed.predictions).toBeDefined();
        expect(parsed.recommendations).toBeDefined();
        expect(parsed.confidence_intervals).toBeDefined();

        // Validate api_calls_per_day mapping
        // From synthetic data: 100 -> 200 -> 300 over 3 days (slope=100 per day). In 90 days, it'll be around 9000+
        expect(parsed.predictions.api_calls_per_day).toBeDefined();
        expect(parsed.predictions.api_calls_per_day.max_predicted_value).toBeGreaterThan(8000);

        // Find recommendation for swarm_agent (rule: ratio 0.01)
        const swarmRec = parsed.recommendations.find((r: any) => r.resource === 'swarm_agent');
        expect(swarmRec).toBeDefined();
        expect(swarmRec.metric).toBe('api_calls_per_day');
        expect(swarmRec.required_amount).toBeGreaterThan(80); // 9000 * 0.01 = 90

        // Find recommendation for token_budget (rule: ratio 1000000)
        const tokenRec = parsed.recommendations.find((r: any) => r.resource === 'token_budget');
        expect(tokenRec).toBeDefined();
        expect(tokenRec.metric).toBe('active_swarms');
        expect(tokenRec.required_amount).toBeGreaterThan(1000000); // at least 1 * 1000000
    });
});
