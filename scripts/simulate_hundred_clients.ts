import { simulateScalingScenario } from "../src/mcp_servers/hyper_scaling_engine/scaling_core.js";

async function main() {
    console.log("==========================================");
    console.log("Hyper-Scaling Engine Simulation");
    console.log("==========================================");

    const scenarios = [
        { clients: 10, tasksPerClient: 5 },
        { clients: 50, tasksPerClient: 10 },
        { clients: 100, tasksPerClient: 20 },
        { clients: 250, tasksPerClient: 30 },
        { clients: 500, tasksPerClient: 50 }
    ];

    for (const scenario of scenarios) {
        console.log(`\nSimulating Scenario: ${scenario.clients} Clients, ${scenario.tasksPerClient} Tasks/Client`);
        const result = await simulateScalingScenario(scenario.clients, scenario.tasksPerClient);
        console.log(JSON.stringify(result, null, 2));
    }
}

main().catch(console.error);
