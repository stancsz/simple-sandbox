# Performance Tuning

## LanceDB Vector Search Optimization

This document outlines the performance optimizations applied to `LanceConnector` to support multi-tenant, high-concurrency vector searches.

### Problem
As the system scaled to handle 100+ concurrent agency swarms, vector searches via `LanceConnector` became a bottleneck. The initial implementation:
- Established a single `lancedb.Connection` globally but re-opened `lancedb.Table` instances on every query, which is extremely I/O intensive.
- Lacked advanced indexing on the vector columns (IVF-PQ), leading to slow brute-force K-Nearest Neighbor searches.
- Handled multi-tenant queries serially instead of batching them efficiently.
- Blocked concurrent reads on the `SemanticGraph` using exclusive mutex locks.

### Solution

#### 1. Connection and Table Pooling (`LRUCache`)
We introduced `LanceDBPool` which wraps `lru-cache`. It now caches both `lancedb.Connection` and `lancedb.Table` instances:
- **Connection Cache**: Keeps up to 200 concurrent databases open.
- **Table Cache**: Keeps up to 500 table instances open across different tenant namespaces. By reusing these instances, we completely avoid the `db.openTable()` penalty during read-heavy workloads.

#### 2. Advanced Indexing (IVF-PQ & B-Tree)
The `createVectorIndex` method in `LanceConnector` now dynamically calculates the number of partitions (`numPartitions`) based on the table's row count (or environment overrides), defaulting to standard IVF-PQ settings.
- **IVF-PQ Index**: Speeds up similarity searches significantly.
- **B-Tree Index**: Added B-tree indexing on metadata columns (like `id`) for accelerated filtering during hybrid searches.

#### 3. Concurrent Query Batching (`batchQuery`)
Added `batchQuery` to `LanceConnector` to allow the system to submit arrays of queries simultaneously, processing them via `Promise.all` while relying on the cached table instances.

#### 4. Semantic Graph Read Optimization
Removed `mutex.runExclusive` for pure read operations (`query`, `getGraphData`) in `SemanticGraph`. Reads can now happen concurrently alongside background syncs, massively improving throughput for graph traversal.

---

## Benchmarking

A comprehensive multi-tenant performance test is available in `tests/performance/lancedb_scalability.test.ts`.

It simulates:
- 100 concurrent tenants.
- 256 generated documents per tenant (to train IVF-PQ clusters).
- 10 simultaneous queries per tenant using the new `batchQuery` functionality.

### Running the Benchmark

```bash
npm run test:performance
```

The output will measure Setup Time, Average Latency, P95/P99 latencies, and total Heap Memory usage to ensure the `LRUCache` isn't leaking references.
