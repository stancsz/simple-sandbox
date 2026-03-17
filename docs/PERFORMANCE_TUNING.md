# LanceDB Performance Tuning & Multi-Tenant Optimizations

This document details the performance validations and optimizations implemented to ensure the Brain MCP's LanceDB integration can scale gracefully for 100+ concurrent multi-tenant workloads.

## Background
The Agency Ecosystem heavily relies on LanceDB to store and retrieve company contexts, episodic memories, and embeddings. In a production environment with many distinct tenants (child agencies or distinct company contexts), managing memory and I/O throughput for hundreds of individual vector databases simultaneously requires deliberate connection pooling and read path optimization.

## Key Optimizations

1. **Global Connection & Open Table Pooling (LRU Caching)**
   - Problem: Repeatedly connecting and opening `lancedb.Table` instances across hundreds of simultaneous concurrent API requests overwhelmed the filesystem lock mechanics, producing high latency spikes.
   - Solution: Introduced an `LRUCache` within `LanceDBPool` for both `Connection` instances (`max: 200`) and open `Table` instances (`max: 500`). This completely eliminates redundant connection and filesystem parsing overhead on hot paths.

2. **Batch Query Processing (`batchQuery`)**
   - Problem: When retrieving multiple references per tenant (e.g. processing large batches of tasks), sequential `table.search().limit()` queries incurred unnecessary round-trips.
   - Solution: Added a `batchQuery` method to `LanceConnector`, mapping arrays of query vectors into concurrent Promises against the pre-opened `Table` references. This aggregates throughput without blocking individual queries.

3. **IVF-PQ Indexing Tuning**
   - Problem: Unindexed vector brute-force distances degraded with high data volume.
   - Solution: Implemented IVF-PQ (Inverted File Index with Product Quantization) index creation conditionally triggered when data volumes surpass 256 rows. We use small partitions (`numPartitions: 2`) to prioritize memory safety and query speed during test scenarios, which can be tuned for varying row sizes in production.

## Performance Validation Results

Before optimizations, querying 100 concurrent tenants with 20 parallel queries each frequently bottlenecked I/O, driving tail latencies beyond 6.5s.

After optimizations via `batchQuery` and Open Table LRU Caching:

| Metric | Pre-Optimization | Post-Optimization |
|--------|------------------|-------------------|
| **Avg Latency** | ~4,728 ms | ~806 ms |
| **p95 Latency** | ~4,920 ms | ~815 ms |
| **p99 Latency** | ~7,118 ms | ~820 ms |
| **Max Latency** | ~7,149 ms | ~822 ms |
| **Throughput** | ~200 QPS | ~121 QPS (batch mapped) to 420 QPS (individual) |
| **Memory Delta** | ~9 MB | Variable (often negative from V8 GC) |

*Metrics recorded locally using `npx vitest run tests/performance/lancedb_scalability.test.ts` and `scripts/validate_lancedb_performance.ts`.*

## Production Recommendations

- **Hardware**: For large node clusters (>100 active tenants with millions of rows), allocate minimum 2GB RAM per Node process to allow comfortable bounds for the LRUCache.
- **Cache Scaling**: Monitor hit rates on `lanceDBPool.tables`. If tenant count exceeds 500, consider increasing the max LRU limit.
- **Index Minimums**: The IVF-PQ indexing step relies on K-Means clustering. Ensure a minimum of 256 documents are present before indexing to avoid clustering faults. The current implementation manages this gracefully by dynamically checking `countRows() >= 256` before applying `createVectorIndex`.
