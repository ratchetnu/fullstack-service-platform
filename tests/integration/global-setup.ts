/**
 * Creates a fresh test database and applies every migration, exactly as a
 * deploy would. Runs once before the integration suite.
 */
import { existsSync } from "node:fs";
import pg from "pg";
import { migrate } from "../../src/server/db/migrator";

export const DEFAULT_TEST_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/service_platform_test";

export default async function setup(): Promise<void> {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = new URL(process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL);
  const database = url.pathname.slice(1);
  if (!/^[a-z0-9_]*test[a-z0-9_]*$/.test(database)) {
    throw new Error(`Refusing to recreate "${database}": test database names must contain "test".`);
  }
  process.env.TEST_DATABASE_URL = url.toString();

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }

  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await migrate(client);
  } finally {
    await client.end();
  }
}
