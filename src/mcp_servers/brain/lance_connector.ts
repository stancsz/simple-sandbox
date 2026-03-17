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
  private tables: LRUCache<string, Promise<lancedb.Table>>;

  constructor() {
    const maxConnections = process.env.LANCE_POOL_SIZE ? parseInt(process.env.LANCE_POOL_SIZE, 10) : 200;
    this.connections = new LRUCache({
      max: maxConnections, // Handle 100+ concurrent clients
      dispose: async (value: Promise<lancedb.Connection>, key: string) => {
        // LanceDB doesn't have a strict explicit close method in Node in all versions,
        // but if it does we could call it here. For now, garbage collection handles it.
      }
    });
    this.tables = new LRUCache({
      max: maxConnections * 2, // Cache open tables to avoid expensive openTable calls
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

  async getTable(dbPath: string, tableName: string, connectFn: () => Promise<lancedb.Connection>): Promise<lancedb.Table | null> {
    const tableKey = `${dbPath}::${tableName}`;
    if (!this.tables.has(tableKey)) {
      const tablePromise = (async () => {
        const db = await connectFn();
        const tableNames = await db.tableNames();
        if (tableNames.includes(tableName)) {
          return await db.openTable(tableName);
        }
        throw new Error(`Table ${tableName} not found in ${dbPath}`);
      })();

      // Store the promise in the cache
      this.tables.set(tableKey, tablePromise);

      // If the promise rejects (e.g. table not found), we must remove it from the cache
      // so we don't cache failures indefinitely.
      tablePromise.catch(() => {
          this.tables.delete(tableKey);
      });

      try {
          return await tablePromise;
      } catch (e) {
          return null; // Return null gracefully as before
      }
    }

    // For cached promises, await them and handle potential latent rejections
    try {
        return await this.tables.get(tableKey)!;
    } catch (e) {
        this.tables.delete(tableKey);
        return null;
    }
  }

  invalidateTable(dbPath: string, tableName: string) {
    this.tables.delete(`${dbPath}::${tableName}`);
  }

  clear() {
    this.connections.clear();
    this.tables.clear();
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
      try {
          return await lanceDBPool.getTable(this.dbPath, tableName, () => this.connect());
      } catch (e) {
          console.warn(`Failed to get table ${tableName}:`, e);
      }
      return null;
  }

  async createTable(tableName: string, data: any[]): Promise<lancedb.Table> {
      const db = await this.connect();
      // Use proper error handling to avoid schema conflicts.
      // For existing tables we drop them in the createTable call to ensure the schema matches
      // the new data, especially in tests. If this causes issues, we can revert to checking and adding.
      try {
          const names = await db.tableNames();
          if (names.includes(tableName)) {
              await db.dropTable(tableName);
          }
      } catch (e) {
          // Ignore drop errors
      }
      const table = await db.createTable(tableName, data);
      lanceDBPool.invalidateTable(this.dbPath, tableName);

      // Attempt to create index if we immediately insert enough data,
      // otherwise it will be created during openTable/add if it hits threshold.
      // We increased the data length requirement to ensure K-Means doesn't throw empty cluster warnings
      // for highly similar mock data.
      if (data.length >= 256) {
          await this.createVectorIndex(table);
      }
      return table;
  }

  async batchQuery(queries: { tableName: string, queryVector: number[], limit?: number }[]): Promise<any[][]> {
      return Promise.all(queries.map(async (q) => {
          const table = await this.getTable(q.tableName);
          if (!table) return [];
          return table.search(q.queryVector).limit(q.limit || 3).toArray();
      }));
  }

  async optimizeTable(tableName: string): Promise<void> {
      const table = await this.getTable(tableName);
      if (table) {
          try {
             const rowCount = await table.countRows();
             if (rowCount >= 256) {
                 await this.createVectorIndex(table);
             }
          } catch (e) {
              console.warn(`Failed to optimize table ${tableName}:`, e);
          }
      }
  }

  async createVectorIndex(table: lancedb.Table, columnName: string = "vector"): Promise<void> {
      try {
          // IVF-PQ index creation. Uses smaller partitions for test viability but provides significant speedup
          // for large multi-tenant datasets. Requires minimum 256 rows generally to train K-Means.

          const rowCount = await table.countRows();
          const numPartitions = process.env.LANCE_INDEX_PARTITIONS
              ? parseInt(process.env.LANCE_INDEX_PARTITIONS, 10)
              : Math.min(128, Math.max(2, Math.floor(rowCount / 256)));

          const numSubVectors = process.env.LANCE_INDEX_SUB_VECTORS
              ? parseInt(process.env.LANCE_INDEX_SUB_VECTORS, 10)
              : 16;

          await table.createIndex(columnName, {
              config: lancedb.Index.ivfPq({
                  numPartitions,
                  numSubVectors,
              }),
              replace: true
          });

          // Also create a b-tree index on some common metadata fields if possible.
          // In a real scenario we might loop through schema fields or known metadata fields.
          try {
              await table.createIndex("id", {
                  config: lancedb.Index.btree(),
                  replace: true
              });
          } catch (e) {
              // Ignore if btree fails
          }
      } catch (e) {
          // It's possible the index creation fails if the index already exists or another reason.
          // We can safely ignore or log it.
          console.debug(`Could not create vector index on ${columnName} (may already exist or data insufficient):`, e);
      }
  }
}
