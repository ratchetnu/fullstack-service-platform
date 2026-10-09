import { connect, loadEnv, refuseInProduction, requireDatabaseUrl } from "./env";
import { DEMO_USERS, seed } from "./seed-data";

loadEnv();
refuseInProduction("seed demo data");
const client = await connect(requireDatabaseUrl());
try {
  const { rows } = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM users");
  if ((rows[0]?.count ?? 0) > 0) {
    console.log("Database already has data; skipping seed. Run `npm run db:reset` to start over.");
  } else {
    await client.query("BEGIN");
    const result = await seed(client);
    await client.query("COMMIT");
    console.log(`Seeded ${result.customers} customers and ${result.bookings} bookings.`);
    console.log("Demo sign-in:");
    for (const user of DEMO_USERS) console.log(`  ${user.role.padEnd(5)}  ${user.email} / ${user.password}`);
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
