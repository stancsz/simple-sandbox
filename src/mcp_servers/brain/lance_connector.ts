import * as lancedb from "@lancedb/lancedb";
import { Mutex } from "async-mutex";
import { join, dirname } from "path";
import { mkdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
// @ts-ignore
import { lock } from "proper-lockfile";
import { LRUCache } from "lru-cache";

// Global connection pool to handle multi-tenant scenarios efficiently
class LanceDBPool {
  private connections: LRUCache<string, Promise<lancedb.Connection>>;
  // Cache to store open table instances across the application lifetime to avoid repeated file system access
  private tables: LRUCache<string, Promise<lancedb.Table | null>>;

  constructor() {
    this.connections = new LRUCache({
      max: 200, // Handle 100+ concurrent clients
    });

    // Table cache to speed up concurrent queries on the same tables
    this.tables = new LRUCache({
      max: 500, // Handle enough tables across multiple tenants
    });
  }

  async getConnection(dbPath: string): Promise<lancedb.Connection> {
    if (!this.connections.has(dbPath)) {
      const connPromise = (async () => {
        if (!existsSync(dbPath)) {
          await mkdir(dbPath, { recursive: true });
        }
        return await lancedb.connect(dbPath);
      })();
      this.connections.set(dbPath, connPromise);
    }
    return this.connections.get(dbPath)!;
  }

  async getTable(dbPath: string, tableName: string): Promise<lancedb.Table | null> {
    const tableKey = `${dbPath}:${tableName}`;
    if (!this.tables.has(tableKey)) {
      const tablePromise = (async () => {
        const db = await this.getConnection(dbPath);
        try {
          const tableNames = await db.tableNames();
          if (tableNames.includes(tableName)) {
            return await db.openTable(tableName);
          }
        } catch (e) {
          console.warn(`Failed to open table ${tableName}:`, e);
        }
        return null;
      })();
      this.tables.set(tableKey, tablePromise);
    }
    return this.tables.get(tableKey)!;
  }

  invalidateTable(dbPath: string, tableName: string): void {
    const tableKey = `${dbPath}:${tableName}`;
    this.tables.delete(tableKey);
  }
}

export const lanceDBPool = new LanceDBPool();

export class LanceConnector {
  private dbPath: string;
  private companyMutexes: Map<string, Mutex> = new Map();

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async connect(): Promise<lancedb.Connection> {
    return await lanceDBPool.getConnection(this.dbPath);
  }

  private getMutex(company: string): Mutex {
    if (!this.companyMutexes.has(company)) {
      this.companyMutexes.set(company, new Mutex());
    }
    return this.companyMutexes.get(company)!;
  }

  async withLock<T>(company: string | undefined, action: () => Promise<T>): Promise<T> {
    const targetCompany = company || "default";
    // Sanitize company name for file path safety
    const safeCompany = targetCompany.replace(/[^a-zA-Z0-9_-]/g, "_");

    const mutex = this.getMutex(safeCompany);

    return mutex.runExclusive(async () => {
      // Inter-process locking using file system
      const lockDir = join(this.dbPath, "locks");
      if (!existsSync(lockDir)) {
        await mkdir(lockDir, { recursive: true });
      }

      const lockFile = join(lockDir, `${safeCompany}.lock`);
      if (!existsSync(lockFile)) {
        await writeFile(lockFile, "");
      }

      let release: () => Promise<void>;
      try {
        release = await lock(lockFile, {
          retries: {
            retries: 20,
            factor: 2,
            minTimeout: 100,
            maxTimeout: 2000,
            randomize: true
          },
          stale: 30000, // 30 seconds lock expiration
        });
      } catch (e: any) {
         throw new Error(`Failed to acquire lock for company ${safeCompany}: ${e.message}`);
      }

      try {
        return await action();
      } finally {
        await release();
      }
    });
  }

  async getTable(tableName: string): Promise<lancedb.Table | null> {
      return await lanceDBPool.getTable(this.dbPath, tableName);
  }

  async createTable(tableName: string, data: any[]): Promise<lancedb.Table> {
      const db = await this.connect();
      const table = await db.createTable(tableName, data);

      // Attempt to create index if we immediately insert enough data,
      // otherwise it will be created during openTable/add if it hits threshold.
      // We increased the data length requirement to ensure K-Means doesn't throw empty cluster warnings
      // for highly similar mock data.
      if (data.length >= 256) {
          await this.createVectorIndex(table);
          await this.createMetadataIndex(table);
      }

      // Invalidate the cache to ensure the latest instance is fetched next time
      lanceDBPool.invalidateTable(this.dbPath, tableName);
      return table;
  }

  async optimizeTable(tableName: string): Promise<void> {
      const table = await this.getTable(tableName);
      if (table) {
          try {
             const rowCount = await table.countRows();
             if (rowCount >= 256) {
                 await this.createVectorIndex(table);
                 await this.createMetadataIndex(table);
             }
          } catch (e) {
              console.warn(`Failed to optimize table ${tableName}:`, e);
          }
      }
  }

  async batchQuery(tableName: string, vectors: number[][], filter?: string, limit: number = 5): Promise<any[][]> {
      const table = await this.getTable(tableName);
      if (!table) return [];

      const promises = vectors.map(async (vector) => {
          let search = table.search(vector).limit(limit);
          if (filter) {
              search = search.where(filter);
          }
          return await search.toArray();
      });
      return await Promise.all(promises);
  }

  async createMetadataIndex(table: lancedb.Table): Promise<void> {
      try {
          const schema = await table.schema();
          // Find standard string/categorical metadata fields to index (e.g., 'type', 'tenant')
          const fields = schema.fields.map(f => f.name);
          if (fields.includes("type")) {
              await table.createIndex("type", { config: lancedb.Index.btree() });
          }
      } catch (e) {
          console.debug(`Could not create metadata btree index:`, e);
      }
  }

  async createVectorIndex(table: lancedb.Table, columnName: string = "vector"): Promise<void> {
      try {
          // IVF-PQ index creation. Adapts partitions and subvectors based on table size
          // for large multi-tenant datasets. Requires minimum 256 rows generally to train K-Means.
          const rowCount = await table.countRows();
          const numPartitions = Math.max(2, Math.min(Math.floor(rowCount / 256), 64)); // Scale up to 64 partitions

          await table.createIndex(columnName, {
              config: lancedb.Index.ivfPq({
                  numPartitions: numPartitions,
                  numSubVectors: 2, // Standard setting for basic 1536 dim embeddings testing
              }),
              replace: true
          });
      } catch (e) {
          // It's possible the index creation fails if the index already exists or another reason.
          // We can safely ignore or log it.
          console.debug(`Could not create vector index on ${columnName} (may already exist or data insufficient):`, e);
      }
  }
}
