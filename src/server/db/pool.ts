import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getConfig } from "../config";

/** Anything that can run a query: the pool itself, or a client inside a transaction. */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

export type TransactionClient = PoolClient;

// Kept on globalThis so hot reloads in development do not open a new pool each time.
const globalForDb = globalThis as typeof globalThis & { __servicePlatformPool?: Pool };

export function getPool(): Pool {
  if (!globalForDb.__servicePlatformPool) {
    const pool = new Pool({
      connectionString: getConfig().databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      // Guard rail: no single statement may run for more than 10 seconds.
      statement_timeout: 10_000,
    });
    globalForDb.__servicePlatformPool = pool;
  }
  return globalForDb.__servicePlatformPool;
}

export async function closePool(): Promise<void> {
  const pool = globalForDb.__servicePlatformPool;
  globalForDb.__servicePlatformPool = undefined;
  await pool?.end();
}
