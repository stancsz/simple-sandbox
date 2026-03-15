import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

export interface SimulationConfig {
    clientCount: number;
    steps: number;
    baseDemandPerClient: number;
}

export interface ClientTier {
    name: string;
    multiplier: number;
    count: number;
}

export interface SimulationResult {
    totalSimulatedCost: number;
    naiveBaselineCost: number;
    costSavingsPercentage: number;
    averageResponseTimeMs: number;
    budgetViolations: number;
    metrics: any[];
}

export class HyperScalingSimulation {
    private client: Client | null = null;
    private auditorClient: Client | null = null;
    private config: SimulationConfig;
    private transport: StdioClientTransport | null = null;
    private auditorTransport: StdioClientTransport | null = null;
    private logs: string[] = [];
    private tiers: ClientTier[] = [];

    constructor(config: Partial<SimulationConfig> = {}) {
        this.config = {
            clientCount: config.clientCount || 100,
            steps: config.steps || 24, // e.g. 24 hours
            baseDemandPerClient: config.baseDemandPerClient || 10
        };

        // Distribute clients into tiers
        const enterpriseCount = Math.floor(this.config.clientCount * 0.1); // 10%
        const startupCount = Math.floor(this.config.clientCount * 0.3); // 30%
        const smbCount = this.config.clientCount - enterpriseCount - startupCount; // 60%

        this.tiers = [
            { name: "Enterprise", multiplier: 5.0, count: enterpriseCount },
            { name: "Startup", multiplier: 2.0, count: startupCount },
            { name: "SMB", multiplier: 1.0, count: smbCount }
        ];
    }

    private log(message: string) {
        this.logs.push(message);
        console.log(`[SIMULATION] ${message}`);
    }

    public async initialize() {
        this.log("Initializing Hyper-Scaling Production Simulation...");
        this.log(`Config: ${this.config.clientCount} clients, ${this.config.steps} steps.`);

        let command = "npx";
        let args = ["tsx", "src/mcp_servers/hyper_scaling_engine/index.ts"];

        try {
            const mcpJsonPath = join(process.cwd(), "mcp.json");
            if (existsSync(mcpJsonPath)) {
                const mcpConfig = JSON.parse(readFileSync(mcpJsonPath, "utf-8"));
                if (mcpConfig.mcpServers && mcpConfig.mcpServers.hyper_scaling_engine) {
                    command = mcpConfig.mcpServers.hyper_scaling_engine.command;
                    args = mcpConfig.mcpServers.hyper_scaling_engine.args;
                }
            }
        } catch (e) {
            this.log("Warning: Could not read mcp.json, using fallback command.");
        }

        this.transport = new StdioClientTransport({ command, args });
        this.client = new Client(
            { name: "simulation_client", version: "1.0.0" },
            { capabilities: {} }
        );

        await this.client.connect(this.transport);
        this.log("Connected to Hyper-Scaling Engine MCP Server.");

        let auditorCommand = "npx";
        let auditorArgs = ["tsx", "src/mcp_servers/ecosystem_auditor/index.ts"];

        try {
            const mcpJsonPath = join(process.cwd(), "mcp.json");
            if (existsSync(mcpJsonPath)) {
                const mcpConfig = JSON.parse(readFileSync(mcpJsonPath, "utf-8"));
                if (mcpConfig.mcpServers && mcpConfig.mcpServers.ecosystem_auditor) {
                    auditorCommand = mcpConfig.mcpServers.ecosystem_auditor.command;
                    auditorArgs = mcpConfig.mcpServers.ecosystem_auditor.args;
                }
            }
        } catch (e) {
            this.log("Warning: Could not read mcp.json for ecosystem_auditor, using fallback command.");
        }

        this.auditorTransport = new StdioClientTransport({ command: auditorCommand, args: auditorArgs });
        this.auditorClient = new Client(
            { name: "simulation_auditor_client", version: "1.0.0" },
            { capabilities: {} }
        );

        try {
            await this.auditorClient.connect(this.auditorTransport);
            this.log("Connected to Ecosystem Auditor MCP Server.");
        } catch (e) {
            this.log("Failed to connect to Ecosystem Auditor MCP Server, metrics will not be logged. Continuing...");
            this.auditorClient = null;
        }
    }

    public async run(): Promise<SimulationResult> {
        if (!this.client) throw new Error("Client not initialized.");

        let totalSimulatedCost = 0;
        let naiveBaselineCost = 0;
        let budgetViolations = 0;
        const allMetrics = [];

        for (let step = 0; step < this.config.steps; step++) {
            this.log(`\n--- Step ${step + 1}/${this.config.steps} ---`);

            // 1. Generate fluctuating demand (Sine wave + random spikes)
            // Sine wave peaks in the middle of the day (steps)
            const timeOfDayFactor = Math.sin((step / this.config.steps) * Math.PI);
            const randomSpike = Math.random() > 0.8 ? 2.0 : 1.0; // 20% chance of a spike

            let stepTaskVolume = 0;
            for (const tier of this.tiers) {
                const tierDemand = tier.count * this.config.baseDemandPerClient * tier.multiplier * timeOfDayFactor * randomSpike;
                stepTaskVolume += Math.floor(tierDemand);
            }

            // Ensure at least some minimum activity
            stepTaskVolume = Math.max(stepTaskVolume, this.config.clientCount * 2);

            this.log(`Generated simulated task volume: ${stepTaskVolume}`);

            // Normally evaluate_massive_demand calls the Brain/Linear, but for the script we simulate
            // the scale scenario based on the generated volume.
            // We use simulate_scaling_scenario to act as our oracle for required resources given target clients & volume per client.
            const averageTasksPerClient = Math.ceil(stepTaskVolume / this.config.clientCount);

            const demandResult: any = await this.client.callTool({
                name: "simulate_scaling_scenario",
                arguments: {
                    targetClients: this.config.clientCount,
                    tasksPerClient: averageTasksPerClient
                }
            });

            if (demandResult.isError) {
                this.log(`Error evaluating demand: ${demandResult.content[0].text}`);
                continue;
            }

            const demandData = JSON.parse(demandResult.content[0].text);
            const requestedSwarms = demandData.requiredSwarms;
            this.log(`Requested Swarms: ${requestedSwarms} | Health Prediction: ${demandData.systemHealthPrediction}`);

            // 2. Enforce Budget
            const budgetResult: any = await this.client.callTool({
                name: "enforce_resource_budget",
                arguments: {
                    requestedSwarms: requestedSwarms
                }
            });

            const budgetData = JSON.parse(budgetResult.content[0].text);
            const allowedSwarms = budgetData.allowedSwarms;

            if (budgetData.budgetExceeded) {
                this.log(`ALERT: Budget Exceeded! Requested ${requestedSwarms}, Allowed ${allowedSwarms}. Applying constraints.`);
                budgetViolations++;
            } else {
                this.log(`Budget Check Passed. Allocating ${allowedSwarms} swarms.`);
            }

            // 3. Optimize Costs
            const optResult: any = await this.client.callTool({
                name: "optimize_global_costs",
                arguments: {
                    projectedSwarms: allowedSwarms
                }
            });

            const optData = JSON.parse(optResult.content[0].text);
            this.log(`Cost Optimization: Strategy = ${optData.routingLogic}, Savings = ${optData.estimatedSavingsPercentage}%`);

            // Calculate costs for this step
            // Base cost assumption: 1 swarm = $10 per step (arbitrary unit)
            const stepNaiveCost = requestedSwarms * 10;
            const stepOptimizedCost = (allowedSwarms * 10) * (1 - (optData.estimatedSavingsPercentage / 100));

            naiveBaselineCost += stepNaiveCost;
            totalSimulatedCost += stepOptimizedCost;

            const metricData = {
                step,
                volume: stepTaskVolume,
                requestedSwarms,
                allowedSwarms,
                savingsPercentage: optData.estimatedSavingsPercentage,
                naiveCost: stepNaiveCost,
                optimizedCost: stepOptimizedCost
            };
            allMetrics.push(metricData);

            if (this.auditorClient) {
                try {
                    await this.auditorClient.callTool({
                        name: "log_ecosystem_event",
                        arguments: {
                            event_type: "morphology_adjustment",
                            source_agency: "hyper_scaling_simulation",
                            target_agency: "global-ecosystem",
                            description: `Simulation Step ${step} Scaling Adjustment`,
                            metadata: metricData
                        }
                    });
                } catch (e) {
                    // Ignore logger error during simulation
                }
            }
        }

        const costSavingsPercentage = naiveBaselineCost > 0
            ? ((naiveBaselineCost - totalSimulatedCost) / naiveBaselineCost) * 100
            : 0;

        this.log("\n--- Simulation Complete ---");

        const finalResult: SimulationResult = {
            totalSimulatedCost: parseFloat(totalSimulatedCost.toFixed(2)),
            naiveBaselineCost: parseFloat(naiveBaselineCost.toFixed(2)),
            costSavingsPercentage: parseFloat(costSavingsPercentage.toFixed(2)),
            averageResponseTimeMs: 125, // Mocked simulated response time
            budgetViolations,
            metrics: allMetrics
        };

        this.log(`Summary Report:\n${JSON.stringify(finalResult, null, 2)}`);

        return finalResult;
    }

    public async cleanup() {
        if (this.client) {
            await this.client.close();
            this.log("Closed Hyper-Scaling Engine MCP Client connection.");
        }
        if (this.auditorClient) {
            await this.auditorClient.close();
            this.log("Closed Ecosystem Auditor MCP Client connection.");
        }
    }
}

// Allow running directly
if (import.meta.url && process.argv[1] === fileURLToPath(import.meta.url)) {
    const isSmokeTest = process.argv.includes("--smoke");
    const config = isSmokeTest ? { clientCount: 10, steps: 5 } : { clientCount: 150, steps: 24 };

    const sim = new HyperScalingSimulation(config);

    sim.initialize().then(() => {
        return sim.run();
    }).then(() => {
        return sim.cleanup();
    }).catch(e => {
        console.error("Simulation failed:", e);
        process.exit(1);
    });
}
