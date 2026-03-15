import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);

/**
 * Executes a Helm command.
 */
async function runHelmCommand(args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync('helm', args);
    if (stderr) {
      console.warn(`Helm warning: ${stderr}`);
    }
    return stdout;
  } catch (error: any) {
    throw new Error(`Helm command failed: ${error.message}`);
  }
}

/**
 * Deploys the root agency using the Simple-CLI Helm chart.
 */
async function deployRootAgency() {
  console.log('Deploying Root Agency via Helm...');
  const chartPath = path.resolve(process.cwd(), 'deployment/chart/simple-cli');
  const namespace = 'agency-root';

  const args = [
    'upgrade',
    '--install',
    'simple-cli',
    chartPath,
    '--namespace',
    namespace,
    '--create-namespace'
  ];

  const output = await runHelmCommand(args);
  console.log('Root Agency deployed successfully.');
  console.log(output);
}

/**
 * Spawns a child agency by interacting with the Agency Orchestrator MCP.
 * For this script, we'll simulate the tool call by directly calling the module function,
 * or using the mockable @modelcontextprotocol/sdk/client/index.js if needed in tests.
 * Since this is an automation script run locally, we simulate the interaction.
 */
async function spawnInitialChildAgency() {
  console.log('Spawning initial Child Agency...');

  try {
    // In a real scenario, this would connect to the running MCP server
    // For this deployment script, we dynamically import the local function to execute it directly,
    // assuming it's running in the same environment as the root agent, OR we can simulate the MCP client.

    // Using a dynamic import so this file can compile without strict deps
    const { spawnChildAgency } = await import('../src/mcp_servers/agency_orchestrator/tools/index.js');

    const result = await spawnChildAgency({
      role: 'frontend_developer',
      token_budget: 1000,
      resourceLimit: 20
    });

    console.log('Child Agency Spawn Result:', result.success ? 'Success' : 'Failed');
    if (result.success) {
      console.log(`Spawned child ID: ${result.agencyId}`);
      console.log(`Isolated Path: ${result.isolatedPath}`);
    } else {
      console.error(`Error: ${result.error}`);
    }
  } catch (error: any) {
    console.warn('Could not spawn child agency directly. Ensure the root agency is running and use the MCP client.');
    console.error(error.message);
  }
}

async function main() {
  try {
    console.log('Starting Production Ecosystem Deployment...');

    // 1. Deploy the root agency
    await deployRootAgency();

    // 2. Wait for deployment to stabilize (simulated sleep)
    console.log('Waiting for root agency to stabilize...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 3. Spawn the first specialized child agency
    await spawnInitialChildAgency();

    console.log('Production Ecosystem Deployment complete.');
  } catch (error) {
    console.error('Deployment Failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
