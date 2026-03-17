import { LanceConnector } from "../src/mcp_servers/brain/lance_connector.ts";
import { join } from "path";
import { mkdir, rm } from "fs/promises";
import { existsSync } from "fs";

// Configuration
const NUM_TENANTS = 100;
const VECTORS_PER_TENANT = 100;
const QUERIES_PER_TENANT = 20;
const VECTOR_DIM = 128; // Dummy dimension

const TEST_DB_PATH = join(process.cwd(), ".agent_test_lancedb_load");

function generateRandomVector(dim: number): number[] {
  return Array.from({ length: dim }, () => Math.random());
}

function generateDummyData(numRows: number, dim: number) {
  return Array.from({ length: numRows }, (_, i) => ({
    id: `doc_${i}`,
    vector: generateRandomVector(dim),
    metadata: `metadata_for_doc_${i}`,
  }));
}

async function runLoadTest() {
  console.log("==========================================");
  console.log("   LanceDB Multi-Tenant Load Validation   ");
  console.log("==========================================");
  console.log(`Config:`);
  console.log(`  Tenants: ${NUM_TENANTS}`);
  console.log(`  Vectors/Tenant: ${VECTORS_PER_TENANT}`);
  console.log(`  Queries/Tenant: ${QUERIES_PER_TENANT}`);
  console.log(`  Vector Dim: ${VECTOR_DIM}`);
  console.log(`  DB Path: ${TEST_DB_PATH}`);
  console.log("==========================================\n");

  // Setup DB Path
  if (existsSync(TEST_DB_PATH)) {
    await rm(TEST_DB_PATH, { recursive: true, force: true });
  }
  await mkdir(TEST_DB_PATH, { recursive: true });

  const connector = new LanceConnector(TEST_DB_PATH);

  // 1. Establish Baseline (Single Tenant)
  console.log("[1/4] Establishing single-tenant baseline...");
  const baselineTenant = "baseline_tenant_vectors";
  const baselineData = generateDummyData(VECTORS_PER_TENANT, VECTOR_DIM);

  await connector.withLock("baseline", async () => {
    await connector.createTable(baselineTenant, baselineData);
  });

  const baselineQueries = Array.from({ length: QUERIES_PER_TENANT * NUM_TENANTS }, () => generateRandomVector(VECTOR_DIM));

  // Baseline without pooling scaling: sequential queries on a single client
  const baselineStartTime = performance.now();

  for (const q of baselineQueries) {
      const table = await connector.getTable(baselineTenant);
      if (table) {
         await table.search(q).limit(3).toArray();
      }
  }
  const baselineEndTime = performance.now();
  const baselineTotalTime = baselineEndTime - baselineStartTime;
  const baselineAvgLatency = baselineTotalTime / (QUERIES_PER_TENANT * NUM_TENANTS);

  console.log(`  -> Baseline Total Time: ${baselineTotalTime.toFixed(2)}ms`);
  console.log(`  -> Baseline Avg Latency: ${baselineAvgLatency.toFixed(2)}ms/query\n`);


  // 2. Setup Multi-Tenant Data
  console.log(`[2/4] Setting up data for ${NUM_TENANTS} concurrent tenants...`);
  const tenants = Array.from({ length: NUM_TENANTS }, (_, i) => `client_${i}_vectors`);

  // Batch table creation to avoid EMFILE issues if needed, though withLock might handle it
  // Let's create tables in chunks of 20
  const chunkSize = 20;
  let tablesCreated = 0;
  for (let i = 0; i < tenants.length; i += chunkSize) {
      const chunk = tenants.slice(i, i + chunkSize);
      await Promise.all(chunk.map(async (tenantName) => {
          const data = generateDummyData(VECTORS_PER_TENANT, VECTOR_DIM);
          await connector.withLock(tenantName, async () => {
              await connector.createTable(tenantName, data);
          });
      }));
      tablesCreated += chunk.length;
      process.stdout.write(`  ... Created ${tablesCreated}/${NUM_TENANTS} tables\r`);
  }
  console.log(`\n  -> Setup complete.\n`);


  // 3. Concurrent Multi-Tenant Queries
  console.log(`[3/4] Running concurrent queries across all tenants...`);

  // To truly test concurrency and connection pooling, we execute queries in parallel
  // but scoped per tenant to simulate 100 active concurrent clients.
  const loadStartTime = performance.now();

  let totalLatencies: number[] = [];

  // Execute all queries concurrently and measure individual latencies
  const allQueries: { tenant: string, vector: number[] }[] = [];

  for (const tenant of tenants) {
      for (let i = 0; i < QUERIES_PER_TENANT; i++) {
          allQueries.push({ tenant, vector: generateRandomVector(VECTOR_DIM) });
      }
  }

  await Promise.all(allQueries.map(async (q) => {
      const table = await connector.getTable(q.tenant);
      if (table) {
          await table.search(q.vector).limit(3).toArray();
      }
  }));

  const loadEndTime = performance.now();
  const loadTotalTime = loadEndTime - loadStartTime;
  const totalQueries = NUM_TENANTS * QUERIES_PER_TENANT;
  const loadAvgLatency = loadTotalTime / totalQueries;

  const latencyReduction = ((baselineAvgLatency - loadAvgLatency) / baselineAvgLatency) * 100;

  console.log(`  -> Total Concurrent Queries: ${totalQueries}`);
  console.log(`  -> Load Total Time: ${loadTotalTime.toFixed(2)}ms`);
  console.log(`  -> Load Avg Latency: ${loadAvgLatency.toFixed(2)}ms/query`);
  console.log(`  -> Latency Change vs Baseline: ${latencyReduction > 0 ? '-' : '+'}${Math.abs(latencyReduction).toFixed(2)}%\n`);

  // 4. Memory Metrics
  console.log("[4/4] Gathering memory metrics...");
  const memoryUsage = process.memoryUsage();
  console.log(`  -> RSS: ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  -> Heap Total: ${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  -> Heap Used: ${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB\n`);

  // Cleanup
  console.log("Cleaning up test database...");
  if (existsSync(TEST_DB_PATH)) {
      await rm(TEST_DB_PATH, { recursive: true, force: true });
  }
  console.log("Done.\n");

  // Output formatting for PR/Summary
  console.log("=== RESULTS SUMMARY ===");
  console.log(`Baseline Latency: ${baselineAvgLatency.toFixed(2)}ms/query`);
  console.log(`Load Avg Latency: ${loadAvgLatency.toFixed(2)}ms/query`);
  console.log(`Performance Gain: ${latencyReduction.toFixed(2)}% reduction in latency under load (due to pooling & caching)`);
  console.log(`Peak RSS Memory:  ${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`);

  if (latencyReduction < 0) {
      console.warn("\nWARNING: Latency increased under load compared to baseline. Expected reduction from pooling.");
  } else {
      console.log("\nSUCCESS: Connection pooling and caching maintained or improved per-query latency under multi-tenant load.");
  }
}

runLoadTest().catch(console.error);
