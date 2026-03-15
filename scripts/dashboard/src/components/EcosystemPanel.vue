<template>
  <div class="ecosystem-panel">
    <div class="panel">
        <h2>Ecosystem Topology</h2>
        <div class="topology-graph" v-if="topology">
             <div class="node root-node">
                 <strong>{{ topology.role }}</strong><br/>
                 <small>{{ topology.id }}</small>
             </div>
             <div class="edges" v-if="topology.children && topology.children.length > 0">
                 ↓
             </div>
             <div class="children-nodes">
                 <div class="node child-node" v-for="child in topology.children" :key="child.id" :class="child.status">
                     <strong>{{ child.role }}</strong><br/>
                     <small>{{ child.id }}</small><br/>
                     <span class="status-badge">{{ child.status }}</span>
                     <div v-if="child.merged_into" class="merged-info">
                         → {{ child.merged_into }}
                     </div>
                 </div>
             </div>
        </div>
        <div v-else>Loading topology...</div>
    </div>

    <div class="panel">
        <h2>Recent Ecosystem Events</h2>
        <table id="events-table" v-if="events && events.length > 0">
            <thead>
                <tr>
                    <th>Timestamp</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th>Target</th>
                    <th>Summary</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="event in events" :key="event.timestamp + event.description">
                    <td>{{ new Date(event.timestamp).toLocaleString() }}</td>
                    <td><span class="event-type">{{ event.event_type }}</span></td>
                    <td><small>{{ event.source_agency }}</small></td>
                    <td><small>{{ event.target_agency }}</small></td>
                    <td>{{ event.description }}</td>
                </tr>
            </tbody>
        </table>
        <div v-else>No recent events.</div>
    </div>
  </div>
</template>

<script>
export default {
    data() {
        return {
            topology: null,
            events: [],
            pollingInterval: null
        }
    },
    async mounted() {
        await this.loadData();
        this.pollingInterval = setInterval(this.loadData, 15000);
    },
    beforeUnmount() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
    },
    methods: {
        async loadData() {
            try {
                const topRes = await fetch('/api/dashboard/topology');
                this.topology = await topRes.json();
            } catch(e) { console.error("Failed to load topology:", e); }

            try {
                const evRes = await fetch('/api/dashboard/events');
                const data = await evRes.json();
                this.events = data.events || [];
            } catch(e) { console.error("Failed to load events:", e); }
        }
    }
}
</script>

<style scoped>
.ecosystem-panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 100%;
}

.topology-graph {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 8px;
}

.node {
    padding: 15px;
    border-radius: 8px;
    border: 2px solid #ccc;
    text-align: center;
    background: white;
    min-width: 200px;
}

.root-node {
    border-color: #007bff;
    box-shadow: 0 4px 6px rgba(0,123,255,0.1);
}

.edges {
    font-size: 24px;
    color: #6c757d;
    margin: 10px 0;
}

.children-nodes {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
    justify-content: center;
}

.child-node {
    border-color: #28a745;
}

.child-node.merged {
    border-color: #ffc107;
    opacity: 0.8;
}

.child-node.retired {
    border-color: #dc3545;
    opacity: 0.6;
}

.status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.8em;
    margin-top: 5px;
    background: #e9ecef;
}

.merged-info {
    font-size: 0.8em;
    color: #666;
    margin-top: 5px;
}

#events-table {
    width: 100%;
    border-collapse: collapse;
}

#events-table th, #events-table td {
    padding: 10px;
    border-bottom: 1px solid #dee2e6;
    text-align: left;
}

.event-type {
    padding: 2px 6px;
    background: #e9ecef;
    border-radius: 4px;
    font-size: 0.9em;
}
</style>
