import { describe, expect, it } from "vitest";
import { checksum, loadMigrations, type Migration, planMigrations } from "@/server/db/migrator";

const migration = (version: string, sql: string): Migration => ({
  version,
  name: `${version}_example.sql`,
  sql,
  checksum: checksum(sql),
});

describe("planMigrations", () => {
  const available = [migration("0001", "CREATE TABLE a ()"), migration("0002", "CREATE TABLE b ()")];

  it("returns migrations that have not been applied, in order", () => {
    expect(planMigrations(available, []).map((m) => m.version)).toEqual(["0001", "0002"]);
    expect(planMigrations(available, [{ version: "0001", checksum: available[0]!.checksum }]).map((m) => m.version)).toEqual(["0002"]);
  });

  it("refuses to continue if an applied migration was edited", () => {
    expect(() => planMigrations(available, [{ version: "0001", checksum: "different" }])).toThrow(/edited after it was applied/);
  });

  it("refuses to continue if an applied migration's file is missing", () => {
    expect(() => planMigrations(available, [{ version: "0009", checksum: "x" }])).toThrow(/file is missing/);
  });
});

describe("loadMigrations", () => {
  it("loads the repository's migrations in order", async () => {
    const migrations = await loadMigrations();
    expect(migrations.map((m) => m.version)).toEqual(["0001", "0002", "0003"]);
  });
});
