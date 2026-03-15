import { EpisodicMemory } from "../../brain/episodic.js";
import { dirname, join } from "path";
import { getLatestPolicy } from "../../swarm/fleet_manager.js";
import { LinearClient } from "@linear/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, existsSync } from "fs";
import { monitorProjectStatus } from "../agency_orchestrator/tools/index.js";

// Define some interfaces from other servers to avoid tight coupling
interface AgencyStatus {
    id: string;
    status: string;
}

export interface MassiveDemandEvaluation {
    totalActiveClients: number;
    projectedTaskVolume: number;
    recommendedSwarms: number;
    bottleneckRisk: string;
    metrics: any;
}

async function createInternalMcpClient(serverName: string) {
    let command = "npx";
    let args = ["tsx", `src/mcp_servers/${serverName}/index.ts`];

    try {
        const mcpJsonPath = join(process.cwd(), "mcp.json");
        if (existsSync(mcpJsonPath)) {
            const mcpConfig = JSON.parse(readFileSync(mcpJsonPath, "utf-8"));
            if (mcpConfig.mcpServers && mcpConfig.mcpServers[serverName]) {
                command = mcpConfig.mcpServers[serverName].command;
                args = mcpConfig.mcpServers[serverName].args;
            }
        }
    } catch (e) {
        // Fallback to defaults
    }

    const transport = new StdioClientTransport({
        command,
        args
    });

    const client = new Client(
        { name: "hyper_scaling_engine", version: "1.0.0" },
        { capabilities: {} }
    );
    await client.connect(transport);
    return client;
}

// Allow internal overriding for tests
export const Deps = {
    getLinearClient: async () => {
        const apiKey = process.env.LINEAR_API_KEY;
        if (!apiKey) {
            console.warn("No LINEAR_API_KEY found, returning mock issues for demand evaluation.");
            return {
                issues: async () => ({ nodes: new Array(150).fill({}) }) // mock
            } as any;
        }
        return new LinearClient({ apiKey });
    },
    fetchHealthMetrics: async () => {
        let client: Client | null = null;
        try {
            client = await createInternalMcpClient("health_monitor");
            const result: any = await client.callTool({
                name: "get_ecosystem_health",
                arguments: {}
            });
            if (result.content && result.content[0] && result.content[0].text) {
                return JSON.parse(result.content[0].text);
            }
        } catch (e) {
            console.error("Failed to query Health Monitor, using default metrics", e);
        } finally {
            if (client) await client.close();
        }
        return { cpuUsage: 50, memoryUsage: 50, activeSwarms: 1 };
    },
    fetchBusinessOpsMetrics: async () => {
        let client: Client | null = null;
        try {
            client = await createInternalMcpClient("business_ops");
            const result: any = await client.callTool({
                name: "get_profit_loss",
                arguments: {}
            });
            if (result.content && result.content[0] && result.content[0].text) {
                const parsed = JSON.parse(result.content[0].text);
                // Extract or infer some budget metrics
                return {
                    currentBudget: 500000,
                    spendToDate: parsed.expenses || 150000
                };
            }
        } catch (e) {
             console.error("Failed to query Business Ops, using default financial metrics", e);
        } finally {
             if (client) await client.close();
        }
        return { currentBudget: 500000, spendToDate: 150000 };
    },
    fetchAgencyStatus: async (memory: EpisodicMemory) => {
        // Here we query the Agency Orchestrator logic directly as its tools are exported natively
        try {
             const status = await monitorProjectStatus("global-ecosystem", memory);
             return [status];
        } catch (e) {
             return [{ id: "agency-default", status: "active" }];
        }
    },
    fetchClientActivityFromBrain: async (memory: EpisodicMemory) => {
        const memories = await memory.recall("client_activity", 100, "all", "client_activity");
        return memories || [];
    }
};

export async function evaluateMassiveDemand(memory: EpisodicMemory): Promise<MassiveDemandEvaluation> {
    const linear = await Deps.getLinearClient();

    let issueCount = 0;
    try {
        const issues = await linear.issues({ filter: { state: { type: { in: ["started", "unstarted"] } } } });
        issueCount = issues.nodes.length;
    } catch (e) {
        issueCount = 50;
    }

    const clientActivities = await Deps.fetchClientActivityFromBrain(memory);
    const activeClients = Math.max(1, clientActivities.length);

    const tasksPerClient = Math.ceil(issueCount / activeClients);
    const totalVolume = activeClients * tasksPerClient;

    const healthMetrics = await Deps.fetchHealthMetrics();

    let recommended = Math.ceil(totalVolume / 50);
    if (activeClients > 0 && recommended === 0) {
        recommended = 1;
    }

    let risk = "Low";
    if (totalVolume > 500 || healthMetrics.cpuUsage > 80) risk = "Medium";
    if (totalVolume > 2000 || healthMetrics.cpuUsage > 90) risk = "High";
    if (totalVolume > 5000 || healthMetrics.cpuUsage > 95) risk = "Critical";

    return {
        totalActiveClients: activeClients,
        projectedTaskVolume: totalVolume,
        recommendedSwarms: recommended,
        bottleneckRisk: risk,
        metrics: healthMetrics
    };
}

export interface CostOptimizationStrategy {
    routineModel: string;
    complexModel: string;
    estimatedSavingsPercentage: number;
    routingLogic: string;
    financialData: any;
}

export async function optimizeGlobalCosts(projectedSwarms: number): Promise<CostOptimizationStrategy> {
    const bizOps = await Deps.fetchBusinessOpsMetrics();

    let routineModel = "gpt-4o-mini";
    let complexModel = "gpt-4o";
    let savings = 0;
    let routing = "Default fallback routing.";

    if (projectedSwarms > 50 || bizOps.spendToDate > bizOps.currentBudget * 0.5) {
        routineModel = "claude-3-haiku-20240307";
        savings = 25;
        routing = "Strict tiering: Haiku for all data processing/routine tasks, Opus/GPT-4o only for final synthesis.";
    }
    if (projectedSwarms > 150 || bizOps.spendToDate > bizOps.currentBudget * 0.8) {
        routineModel = "gemini-1.5-flash";
        savings = 40;
        routing = "Hyper-scale tiering: Gemini Flash for 90% of tasks, aggressive caching enabled.";
    }

    return {
        routineModel,
        complexModel,
        estimatedSavingsPercentage: savings,
        routingLogic: routing,
        financialData: bizOps
    };
}

export interface BudgetEnforcementResult {
    allowedSwarms: number;
    budgetExceeded: boolean;
    policyConstraintApplied: string | null;
}

export async function enforceResourceBudget(requestedSwarms: number, companyId: string = "default"): Promise<BudgetEnforcementResult> {
    const policy = await getLatestPolicy(companyId);
    let maxSwarms = 1000;
    let constraintApplied = null;
    let exceeded = false;

    if (policy && policy.parameters && policy.parameters.max_concurrent_swarms) {
        maxSwarms = policy.parameters.max_concurrent_swarms;
        constraintApplied = `Policy limit: ${maxSwarms} swarms`;
    }

    let allowed = requestedSwarms;
    if (requestedSwarms > maxSwarms) {
        allowed = maxSwarms;
        exceeded = true;
    }

    return {
        allowedSwarms: allowed,
        budgetExceeded: exceeded,
        policyConstraintApplied: constraintApplied
    };
}

export interface ScalingScenarioResult {
    targetClients: number;
    projectedCostPerMonth: number;
    requiredSwarms: number;
    systemHealthPrediction: string;
}

export async function simulateScalingScenario(targetClients: number, tasksPerClient: number): Promise<ScalingScenarioResult> {
    const totalVolume = targetClients * tasksPerClient;
    const recommendedSwarms = Math.ceil(totalVolume / 50) || 1;

    const optimization = await optimizeGlobalCosts(recommendedSwarms);

    let baseCost = recommendedSwarms * 1000;
    let finalCost = baseCost * (1 - (optimization.estimatedSavingsPercentage / 100));

    let health = "Stable";
    if (recommendedSwarms > 100) health = "Degraded response times likely";
    if (recommendedSwarms > 500) health = "Severe latency, database sharding required";

    return {
        targetClients,
        projectedCostPerMonth: finalCost,
        requiredSwarms: recommendedSwarms,
        systemHealthPrediction: health
    };
}
