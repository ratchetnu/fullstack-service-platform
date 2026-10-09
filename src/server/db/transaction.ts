import "server-only";
import type { Pool, PoolClient } from "pg";
import { PG, pgErrorCode } from "../errors";
import { logger } from "../logger";
import { getPool } from "./pool";

export type IsolationLevel = "read committed" | "repeatable read" | "serializable";

export interface TransactionOptions {
  isolation?: IsolationLevel;
  /** Total attempts, including the first. */
  maxAttempts?: number;
  pool?: Pick<Pool, "connect">;
  /** Injected in tests so retries do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE_CODES = new Set<string>([PG.serializationFailure, PG.deadlockDetected]);

export function isRetryableTransactionError(error: unknown): boolean {
  const code = pgErrorCode(error);
  return code !== undefined && RETRYABLE_CODES.has(code);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Runs `work` inside a database transaction: either everything it writes is
 * saved, or nothing is.
 *
 * If Postgres aborts the transaction because of a conflict with another one
 * (serialization failure or deadlock), the whole unit of work is retried with
 * a short, jittered back-off. `work` must therefore be safe to run more than
 * once — it should only touch the database through `tx`.
 */
export async function withTransaction<T>(
  work: (tx: PoolClient) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const { isolation = "read committed", maxAttempts = 3, sleep = defaultSleep } = options;
  const pool = options.pool ?? getPool();

  for (let attempt = 1; ; attempt++) {
    const client = await pool.connect();
    let connectionBroken = false;
    try {
      await client.query(`BEGIN ISOLATION LEVEL ${isolation.toUpperCase()}`);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        connectionBroken = true;
      }
      if (isRetryableTransactionError(error) && attempt < maxAttempts) {
        logger.warn("transaction conflict, retrying", { attempt, code: pgErrorCode(error) });
        await sleep(backoffMs(attempt));
        continue;
      }
      throw error;
    } finally {
      // A client whose ROLLBACK failed is in an unknown state: destroy it rather
      // than return it to the pool.
      client.release(connectionBroken);
    }
  }
}

function backoffMs(attempt: number): number {
  const base = 20 * 2 ** (attempt - 1);
  return base + Math.floor(Math.random() * base);
}
