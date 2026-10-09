import { describe, expect, it } from "vitest";
import { migrate } from "@/server/db/migrator";
import { db, useDatabase } from "./helpers";

describe("migrations", () => {
  useDatabase();

  it("are recorded, and re-running them changes nothing", async () => {
    const client = await db().connect();
    try {
      await expect(migrate(client)).resolves.toEqual([]);
      const { rows } = await client.query(`SELECT name FROM schema_migrations ORDER BY version`);
      expect(rows.map((r) => r.name)).toEqual([
        "0001_core_schema.sql",
        "0002_staff_auth.sql",
        "0003_job_status_transition_guard.sql",
      ]);
    } finally {
      client.release();
    }
  });

  it("index every foreign key column", async () => {
    // Unindexed foreign keys make deletes and joins slow as tables grow.
    const { rows } = await db().query<{ table_name: string; column_name: string }>(`
      SELECT c.conrelid::regclass::text AS table_name, a.attname AS column_name
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.contype = 'f'
         AND NOT EXISTS (
           SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
         )`);
    expect(rows).toEqual([]);
  });
});
