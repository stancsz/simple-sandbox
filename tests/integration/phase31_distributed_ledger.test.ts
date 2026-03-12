import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { EpisodicMemory, LedgerEntry } from '../../src/brain/episodic.js';
import { recordTransaction, getAgencyBalance, proposeSettlement, applyRevenueSplit } from '../../src/mcp_servers/distributed_ledger/ledger.js';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerLedgerTools } from '../../src/mcp_servers/distributed_ledger/tools.js';
import fs from 'fs';
import path from 'path';

// Mock readStrategy to return a specific revenue split for testing
vi.mock('../../src/mcp_servers/brain/tools/strategy.js', () => ({
    readStrategy: vi.fn().mockImplementation(async (episodic, company) => {
        if (company === 'company_80_20') {
            return { policies: { revenue_sharing: { split: 0.8 } } };
        }
        if (company === 'company_100') {
            return { policies: { revenue_sharing: { split: 1.0 } } };
        }
        return { policies: { revenue_sharing: { split: 0.7 } } }; // Default 70/30
    })
}));

describe('Phase 31: Distributed Ledger', () => {
    let episodic: EpisodicMemory;
    const testDir = path.join(process.cwd(), '.agent_test_ledger');

    beforeAll(async () => {
        // Setup isolated memory
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
        episodic = new EpisodicMemory(testDir);
    });

    afterAll(async () => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    it('should calculate revenue split correctly (70/30)', async () => {
        const entry: LedgerEntry = {
            id: 'txn_split_test',
            timestamp: Date.now(),
            from_agency: 'provider_agency',
            to_agency: 'consumer_agency',
            resource_type: 'llm_tokens',
            quantity: 1000,
            value: 10.0,
            status: 'settled'
        };

        const entries = await applyRevenueSplit(episodic, entry);

        expect(entries.length).toBe(2);

        // Main entry (Provider gets 70%)
        const main = entries.find(e => e.from_agency === 'provider_agency');
        expect(main).toBeDefined();
        expect(main?.quantity).toBe(700);
        expect(main?.value).toBe(7.0);

        // Split entry (Bank gets 30%)
        const split = entries.find(e => e.from_agency === 'bank');
        expect(split).toBeDefined();
        expect(split?.quantity).toBeCloseTo(300, 5);
        expect(split?.value).toBeCloseTo(3.0, 5);
    });

    it('should record a contribution and update balances (80/20 split)', async () => {
        const entry: LedgerEntry = {
            id: 'txn_1',
            timestamp: Date.now(),
            from_agency: 'agency_a',
            to_agency: 'agency_b',
            resource_type: 'compute_minutes',
            quantity: 100,
            value: 50.0,
            status: 'settled'
        };

        const company = 'company_80_20';
        const recorded = await recordTransaction(episodic, entry, company);

        expect(recorded.length).toBe(2);

        // Delay to ensure LanceDB writing completes
        await new Promise(r => setTimeout(r, 2000));

        const balancesA = await getAgencyBalance(episodic, 'agency_a', company);
        const balancesB = await getAgencyBalance(episodic, 'agency_b', company);
        const balancesBank = await getAgencyBalance(episodic, 'bank', company);

        // agency_a (provider) should have credit of 80%
        const aCompute = balancesA.find(b => b.resource === 'compute_minutes');
        expect(aCompute?.balance).toBe(80);
        expect(aCompute?.value).toBe(40.0);

        // agency_b (consumer) should have debit of 100%
        // because it paid main (80) + split (20)
        const bCompute = balancesB.find(b => b.resource === 'compute_minutes');
        expect(bCompute?.balance).toBe(-100);
        expect(bCompute?.value).toBe(-50.0);

        // bank should have credit of 20%
        const bankCompute = balancesBank.find(b => b.resource === 'compute_minutes');
        expect(bankCompute?.balance).toBeCloseTo(20, 5);
        expect(bankCompute?.value).toBeCloseTo(10.0, 5);
    });

    it('should be idempotent and not double-charge', async () => {
        const entry: LedgerEntry = {
            id: 'txn_1', // Same ID
            timestamp: Date.now(),
            from_agency: 'agency_a',
            to_agency: 'agency_b',
            resource_type: 'compute_minutes',
            quantity: 100,
            value: 50.0,
            status: 'settled'
        };

        const company = 'company_80_20';
        const recorded = await recordTransaction(episodic, entry, company);

        // Since it exists, it should return the single existing main entry
        expect(recorded.length).toBe(1);
        expect(recorded[0].id).toBe('txn_1');

        // Balances should remain the same
        const balancesB = await getAgencyBalance(episodic, 'agency_b', company);
        const bCompute = balancesB.find(b => b.resource === 'compute_minutes');
        expect(bCompute?.balance).toBe(-100);
    });

    it('should record 100% revenue to provider if split is 1.0', async () => {
        const entry: LedgerEntry = {
            id: 'txn_2',
            timestamp: Date.now(),
            from_agency: 'agency_x',
            to_agency: 'agency_y',
            resource_type: 'api_calls',
            quantity: 500,
            value: 5.0,
            status: 'settled'
        };

        const company = 'company_100';
        const recorded = await recordTransaction(episodic, entry, company);

        expect(recorded.length).toBe(1);
        expect(recorded[0].quantity).toBe(500);
        expect(recorded[0].value).toBe(5.0);

        await new Promise(r => setTimeout(r, 2000));

        const balancesX = await getAgencyBalance(episodic, 'agency_x', company);
        const balancesY = await getAgencyBalance(episodic, 'agency_y', company);

        const xApi = balancesX.find(b => b.resource === 'api_calls');
        expect(xApi?.balance).toBe(500);

        const yApi = balancesY.find(b => b.resource === 'api_calls');
        expect(yApi?.balance).toBe(-500);
    });

    it('should propose settlement between agencies', async () => {
        const company = 'company_80_20';
        const settlement = await proposeSettlement(episodic, 'agency_b', 'agency_a', 100, 'compute_minutes', company);

        expect(settlement.status).toBe('pending');
        expect(settlement.quantity).toBe(100);
        expect(settlement.from_agency).toBe('agency_b');
        expect(settlement.to_agency).toBe('agency_a');

        await new Promise(r => setTimeout(r, 2000));

        // When agency_b pays agency_a 100 compute_minutes,
        // agency_b is the provider of the settlement resource, agency_a is the consumer.
        // Balances will change accordingly.
        // Note: proposeSettlement does NOT use applyRevenueSplit currently, it directly stores the entry.
        // Let's check balances directly:
        const balancesB = await getAgencyBalance(episodic, 'agency_b', company);
        const bCompute = balancesB.find(b => b.resource === 'compute_minutes');

        // Originally it was -100.
        // Settlement is from agency_b to agency_a (agency_b "provides" settlement)
        // So agency_b gains 100 balance. Total should be 0.
        expect(bCompute?.balance).toBeCloseTo(0, 5);

        const balancesA = await getAgencyBalance(episodic, 'agency_a', company);
        const aCompute = balancesA.find(b => b.resource === 'compute_minutes');

        // Originally it was 80.
        // Settlement is from agency_b to agency_a (agency_a "consumes" settlement)
        // So agency_a loses 100 balance. Total should be -20.
        expect(aCompute?.balance).toBeCloseTo(-20, 5);
    });

    it('should test tools registration (mock server)', async () => {
        const mockServer = new McpServer({ name: "test_ledger", version: "1.0.0" });
        registerLedgerTools(mockServer, episodic);

        // Just checking that we don't crash when registering tools
        expect(mockServer).toBeDefined();
    });
});
