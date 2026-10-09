/**
 * Creates the database if needed, drops everything in it, re-runs all
 * migrations and re-seeds. Development and end-to-end tests only.
 */
import { migrate } from "../src/server/db/migrator";
import { connect, loadEnv, refuseInProduction, requireDatabaseUrl } from "./env";
import { seed } from "./seed-data";

loadEnv();
refuseInProduction("reset the database");
const url = new URL(requireDatabaseUrl());
await createDatabaseIfMissing(url);
const client = await connect(url.toString());
try {
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(client, { log: (message) => console.log(message) });
  await client.query("BEGIN");
  const result = await seed(client);
  await client.query("COMMIT");
  console.log(`Reset complete: ${result.customers} customers, ${result.bookings} bookings.`);
} finally {
  await client.end();
}

async function createDatabaseIfMissing(target: URL): Promise<void> {
  const name = decodeURIComponent(target.pathname.slice(1));
  const maintenance = new URL(target);
  maintenance.pathname = "/postgres";
  const admin = await connect(maintenance.toString());
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!rowCount) {
      await admin.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
      console.log(`Created database ${name}`);
    }
  } finally {
    await admin.end();
  }
}
