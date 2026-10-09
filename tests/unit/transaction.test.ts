import { describe, expect, it, vi } from "vitest";
import { withTransaction } from "@/server/db/transaction";

function pgError(code: string) {
  return Object.assign(new Error(`pg error ${code}`), { code });
}

function fakePool() {
  const statements: string[] = [];
  const release = vi.fn();
  const client = {
    query: vi.fn(async (sql: string) => {
      statements.push(sql);
      return { rows: [], rowCount: 0 };
    }),
    release,
  };
  return { pool: { connect: vi.fn(async () => client) } as never, statements, release };
}

const noSleep = async () => {};

describe("withTransaction", () => {
  it("commits when the work succeeds", async () => {
    const { pool, statements, release } = fakePool();
    await expect(withTransaction(async () => "done", { pool, sleep: noSleep })).resolves.toBe("done");
    expect(statements).toEqual(["BEGIN ISOLATION LEVEL READ COMMITTED", "COMMIT"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rolls back and rethrows ordinary errors without retrying", async () => {
    const { pool, statements, release } = fakePool();
    const work = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(withTransaction(work, { pool, sleep: noSleep })).rejects.toThrow("boom");
    expect(work).toHaveBeenCalledTimes(1);
    expect(statements).toEqual(["BEGIN ISOLATION LEVEL READ COMMITTED", "ROLLBACK"]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it.each(["40001", "40P01"])("retries the whole unit of work on Postgres error %s", async (code) => {
    const { pool, release } = fakePool();
    let calls = 0;
    const result = await withTransaction(
      async () => {
        calls++;
        if (calls < 3) throw pgError(code);
        return "third time lucky";
      },
      { pool, sleep: noSleep, maxAttempts: 3 },
    );
    expect(result).toBe("third time lucky");
    expect(calls).toBe(3);
    expect(release).toHaveBeenCalledTimes(3);
  });

  it("gives up after maxAttempts", async () => {
    const { pool } = fakePool();
    const work = vi.fn(async () => {
      throw pgError("40001");
    });
    await expect(withTransaction(work, { pool, sleep: noSleep, maxAttempts: 2 })).rejects.toMatchObject({ code: "40001" });
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("uses the requested isolation level", async () => {
    const { pool, statements } = fakePool();
    await withTransaction(async () => null, { pool, isolation: "serializable", sleep: noSleep });
    expect(statements[0]).toBe("BEGIN ISOLATION LEVEL SERIALIZABLE");
  });
});
