<<<<<<< SEARCH
export async function retireChildAgency(agencyId: string, memory: EpisodicMemory): Promise<{ agency_id: string; status: string }> {
=======
export async function getAgencyStatus(memory: EpisodicMemory): Promise<any[]> {
    const activeAgencies = new Map<string, any>();

    // Query agency_spawning
    const spawnResults = await memory.recall("agency_spawning", 100, "default", "autonomous_decision");
    if (spawnResults) {
        for (const mem of spawnResults) {
            try {
                const data = JSON.parse((mem as any).solution || mem.agentResponse || "{}");
                if (data.agency_id) {
                    activeAgencies.set(data.agency_id, {
                        agency_id: data.agency_id,
                        role: data.role,
                        resource_limit: data.resource_limit,
                        status: "active",
                        spawned_at: mem.timestamp
                    });
                }
            } catch (e) {}
        }
    }

    // Query agency_merging to mark absorbed agencies
    const mergeResults = await memory.recall("agency_merging", 100, "default", "autonomous_decision");
    if (mergeResults) {
        for (const mem of mergeResults) {
            try {
                const data = JSON.parse((mem as any).solution || mem.agentResponse || "{}");
                if (data.source) {
                    const existing = activeAgencies.get(data.source);
                    if (existing) {
                        existing.status = "merged";
                        existing.merged_into = data.target;
                    }
                }
            } catch (e) {}
        }
    }

    // Query agency_retirement to mark retired agencies
    const retireResults = await memory.recall("agency_retirement", 100, "default", "autonomous_decision");
    if (retireResults) {
        for (const mem of retireResults) {
            try {
                const data = JSON.parse((mem as any).solution || mem.agentResponse || "{}");
                if (data.agency_id) {
                    const existing = activeAgencies.get(data.agency_id);
                    if (existing) {
                        existing.status = "retired";
                    }
                }
            } catch (e) {}
        }
    }

    return Array.from(activeAgencies.values());
}

export async function retireChildAgency(agencyId: string, memory: EpisodicMemory): Promise<{ agency_id: string; status: string }> {
>>>>>>> REPLACE
