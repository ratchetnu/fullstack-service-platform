/**
 * A deliberately small SQL migration runner.
 *
 * - Migrations are plain .sql files in db/migrations, applied in file-name order.
 * - Each migration runs in its own transaction, so a failing migration leaves
 *   the schema exactly as it was.
 * - Applied migrations are recorded with a checksum. Editing a migration after
 *   it has been applied is refused; write a new migration instead.
 * - A Postgres advisory lock stops two deploys from migrating at the same time.
 *
 * This module is used by scripts as well as the app, so it does not import
 * "server-only".
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ClientBase } from "pg";

export interface Migration {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  version: string;
  checksum: string;
}

const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;
// Arbitrary constant shared by every process that runs migrations.
const MIGRATION_LOCK_ID = 727_274_001;

export const DEFAULT_MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

export function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export async function loadMigrations(dir: string = DEFAULT_MIGRATIONS_DIR): Promise<Migration[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  const migrations: Migration[] = [];
  for (const file of files) {
    const match = FILE_PATTERN.exec(file);
    if (!match) {
      throw new Error(`Migration file name must look like 0001_description.sql: ${file}`);
    }
    const sql = await readFile(path.join(dir, file), "utf8");
    migrations.push({ version: match[1]!, name: file, sql, checksum: checksum(sql) });
  }
  const versions = new Set(migrations.map((m) => m.version));
  if (versions.size !== migrations.length) {
    throw new Error("Two migration files share the same version number.");
  }
  return migrations;
}

/** Decides which migrations still need to run. Pure, so it is unit-tested directly. */
export function planMigrations(available: Migration[], applied: AppliedMigration[]): Migration[] {
  const byVersion = new Map(available.map((m) => [m.version, m]));
  for (const record of applied) {
    const migration = byVersion.get(record.version);
    if (!migration) {
      throw new Error(`Database has migration ${record.version} applied, but its file is missing.`);
    }
    if (migration.checksum !== record.checksum) {
      throw new Error(
        `Migration ${migration.name} was edited after it was applied. Revert the edit and add a new migration instead.`,
      );
    }
  }
  const appliedVersions = new Set(applied.map((record) => record.version));
  return available.filter((m) => !appliedVersions.has(m.version));
}

export async function migrate(
  client: ClientBase,
  options: { dir?: string; log?: (message: string) => void } = {},
): Promise<string[]> {
  const log = options.log ?? (() => {});
  const migrations = await loadMigrations(options.dir);

  await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     text PRIMARY KEY,
        name        text NOT NULL,
        checksum    text NOT NULL,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<AppliedMigration>(
      "SELECT version, checksum FROM schema_migrations ORDER BY version",
    );
    const pending = planMigrations(migrations, rows);
    if (pending.length === 0) log("Database schema is up to date.");

    for (const migration of pending) {
      log(`Applying ${migration.name}`);
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)", [
          migration.version,
          migration.name,
          migration.checksum,
        ]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${migration.name} failed: ${(error as Error).message}`, { cause: error });
      }
    }
    return pending.map((m) => m.name);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
  }
}
