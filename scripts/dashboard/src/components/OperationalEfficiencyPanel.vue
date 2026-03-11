<template>
  <div class="panel efficiency-panel">
    <h3>Phase 28 Operational Efficiency</h3>

    <div class="efficiency-grid" v-if="aggregatedMetrics">
        <!-- Summary Cards -->
        <div class="card stat-card savings">
            <h4>Est. Cost Savings</h4>
            <div class="value">${{ aggregatedMetrics.totalSavings.toFixed(2) }}</div>
        </div>

        <div class="card stat-card">
            <h4>Tokens Saved</h4>
            <div class="value">{{ formatNumber(aggregatedMetrics.tokensSaved) }}</div>
        </div>

        <div class="card stat-card">
            <h4>LLM Cache Size</h4>
            <div class="value">{{ formatBytes(aggregatedMetrics.cacheSizeBytes) }}</div>
        </div>

        <div class="card stat-card">
            <h4>Avg Routing Complexity</h4>
            <div class="value">{{ aggregatedMetrics.avgComplexity.toFixed(1) }}</div>
        </div>
    </div>

    <div class="charts-grid" v-if="aggregatedMetrics">
        <!-- Cache Hit Ratio -->
        <div class="chart-container">
            <h4>Cache Hit vs Miss</h4>
            <div class="ratio-bar">
                <div class="hit" :style="{ width: aggregatedMetrics.cacheHitPercent + '%' }">
                    Hit ({{ aggregatedMetrics.cacheHits }})
                </div>
                <div class="miss" :style="{ width: (100 - aggregatedMetrics.cacheHitPercent) + '%' }">
                    Miss ({{ aggregatedMetrics.cacheMisses }})
                </div>
            </div>
            <div class="sub-text">Hit Ratio: {{ aggregatedMetrics.cacheHitPercent.toFixed(1) }}%</div>
        </div>

        <!-- Batch Processing -->
        <div class="chart-container">
            <h4>Batch Processing</h4>
            <div class="stat-row">
                <span>Batched Calls:</span>
                <strong>{{ aggregatedMetrics.batchedCalls }}</strong>
            </div>
            <div class="stat-row">
                <span>Tokens Saved:</span>
                <strong>{{ formatNumber(aggregatedMetrics.tokensSavedBatched) }}</strong>
            </div>
        </div>

        <!-- Model Routing Breakdown -->
        <div class="chart-container full-width">
            <h4>Model Routing Breakdown</h4>
            <div class="model-breakdown">
                <div v-for="(count, model) in aggregatedMetrics.modelBreakdown" :key="model" class="model-row">
                    <span class="model-name">{{ model }}</span>
                    <div class="model-bar-bg">
                         <div class="model-bar-fill" :style="{ width: (count / aggregatedMetrics.totalModelCalls * 100) + '%' }"></div>
                    </div>
                    <span class="model-count">{{ count }}</span>
                </div>
            </div>
            <div v-if="Object.keys(aggregatedMetrics.modelBreakdown).length === 0" class="sub-text">
                No routing data available.
            </div>
        </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    metricsData: {
      type: Object,
      default: () => ({})
    }
  },
  computed: {
    aggregatedMetrics() {
        if (!this.metricsData || Object.keys(this.metricsData).length === 0) return null;

        let cacheHits = 0;
        let cacheMisses = 0;
        let cacheSizeBytes = 0;
        let tokensSavedBatched = 0;
        let batchedCalls = 0;
        let totalSavings = 0;
        let avgComplexitySum = 0;
        let complexityCount = 0;
        let modelBreakdown = {};
        let totalModelCalls = 0;

        for (const company in this.metricsData) {
            const data = this.metricsData[company];
            if (data.error) continue;

            cacheHits += data.llm_cache_hits || 0;
            cacheMisses += data.llm_cache_misses || 0;
            cacheSizeBytes += data.llm_cache_size_bytes || 0;
            tokensSavedBatched += data.tokens_saved_via_batching || 0;
            batchedCalls += data.batched_calls_count || 0;
            totalSavings += data.estimated_savings_usd || 0;

            if (data.llm_router_avg_complexity > 0) {
                avgComplexitySum += data.llm_router_avg_complexity;
                complexityCount++;
            }

            if (data.llm_router_model_breakdown) {
                 for (const [model, count] of Object.entries(data.llm_router_model_breakdown)) {
                      modelBreakdown[model] = (modelBreakdown[model] || 0) + count;
                      totalModelCalls += count;
                 }
            }
        }

        const totalCacheReqs = cacheHits + cacheMisses;
        const cacheHitPercent = totalCacheReqs > 0 ? (cacheHits / totalCacheReqs) * 100 : 0;
        const avgComplexity = complexityCount > 0 ? avgComplexitySum / complexityCount : 0;

        // Approximate total tokens saved (batching + cache) - assumption 500 avg tokens per cache hit
        const tokensSaved = tokensSavedBatched + (cacheHits * 500);

        return {
            cacheHits,
            cacheMisses,
            cacheHitPercent,
            cacheSizeBytes,
            batchedCalls,
            tokensSavedBatched,
            tokensSaved,
            totalSavings,
            avgComplexity,
            modelBreakdown,
            totalModelCalls
        };
    }
  },
  methods: {
    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    },
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
  }
}
</script>

<style scoped>
.efficiency-panel {
    background: #f8f9fa;
    border-left: 4px solid #17a2b8;
}

.efficiency-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 15px;
    margin-bottom: 20px;
}

.stat-card {
    background: white;
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    text-align: center;
}

.stat-card h4 {
    margin: 0 0 10px 0;
    color: #6c757d;
    font-size: 0.9em;
}

.stat-card .value {
    font-size: 1.5em;
    font-weight: bold;
    color: #343a40;
}

.stat-card.savings .value {
    color: #28a745;
}

.charts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

.chart-container {
    background: white;
    padding: 15px;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.chart-container.full-width {
    grid-column: 1 / -1;
}

.chart-container h4 {
    margin-top: 0;
    border-bottom: 1px solid #eee;
    padding-bottom: 5px;
}

.ratio-bar {
    display: flex;
    height: 24px;
    border-radius: 12px;
    overflow: hidden;
    margin: 10px 0;
    background: #e9ecef;
}

.ratio-bar .hit {
    background: #28a745;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8em;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
}

.ratio-bar .miss {
    background: #dc3545;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8em;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
}

.sub-text {
    font-size: 0.85em;
    color: #6c757d;
    text-align: center;
}

.stat-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px dashed #eee;
}

.model-breakdown {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.model-row {
    display: flex;
    align-items: center;
    gap: 10px;
}

.model-name {
    width: 150px;
    font-size: 0.85em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.model-bar-bg {
    flex-grow: 1;
    background: #e9ecef;
    height: 12px;
    border-radius: 6px;
    overflow: hidden;
}

.model-bar-fill {
    height: 100%;
    background: #007bff;
}

.model-count {
    width: 30px;
    text-align: right;
    font-size: 0.85em;
    font-weight: bold;
}
</style>
