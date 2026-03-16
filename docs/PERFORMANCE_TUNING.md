# LanceDB Performance Tuning & Caching

As the core brain of the autonomous agency, the `EpisodicMemory` instance facilitates context retrieval and continuous cross-agency insights across diverse swarms. With multiple high-concurrency swarms querying the brain continuously, querying `lancedb` operations for similar context structures becomes a measurable performance bottleneck.

## Profiling Methodology
To profile the default performance capabilities of the system under high load, we implemented `scripts/profile_lancedb_performance.ts`.

**Scenario:**
1. Populate `EpisodicMemory` with 100 synthetic memory records representing task histories.
2. Simulate a concurrent load spike of 50 simultaneous `.recall()` query operations triggered via `Promise.all()`.
3. Capture total latency, average latency per query, and peak memory delta across the Node.js process.
4. Execute with isolated embeddings using `MOCK_EMBEDDINGS=true` to accurately isolate LanceDB table search impacts.

## Baseline vs. Optimized Metrics
Prior to caching implementations, each `.recall()` call triggered individual `lancedb` table searches.

**Baseline (Pre-Optimization)**
- Total Latency (50 queries): ~1714 ms
- Average Latency per Query: ~34.28 ms
- Memory Usage Delta: ~8.14 MB

**Optimized (LRU Caching Enabled)**
- Total Latency (50 queries): ~989 ms
- Average Latency per Query: ~19.78 ms
- Memory Usage Delta: ~8.64 MB

**Results:**
The implementation of the in-memory LRU cache reduced the average query latency by roughly **42%**. Caching ensures that repetitive, overlapping multi-agent tasks querying the exact same embedded problem space do not redundantly invoke `lancedb` vector searches. Memory usage experienced a nominal ~0.5 MB overhead to maintain the active cache space.

## Configuration Options

To configure the episodic memory caching layer, modify the `llmCache` object inside `mcp.json` or `.agent/config.json`. The `EpisodicMemory` cache shares the same core settings structure but functions exclusively in-memory for speed.

```json
{
  "llmCache": {
    "enabled": true,
    "ttl": 3600000
  }
}
```

- **enabled**: Toggles the memory cache (`boolean`, defaults to `true`).
- **ttl**: Sets the TTL (Time-To-Live) for cached `PastEpisode` arrays in milliseconds (`number`, defaults to `3600000` or 1 hour).
- **max**: The cache currently maintains a hardcoded max limit of `500` entries to prevent unbounded memory growth. Cache keys are generated via SHA-256 hashes of the target embeddings.

**Note:** Cache invalidation occurs automatically. Whenever a new episodic memory is logged (via `EpisodicMemory.store`), the entire query cache is cleared to ensure subsequent swarms have immediate access to the newly recorded insights.
