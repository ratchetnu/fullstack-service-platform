import { migrate } from "../src/server/db/migrator";
import { connect, loadEnv, requireDatabaseUrl } from "./env";

loadEnv();
const client = await connect(requireDatabaseUrl());
try {
  const applied = await migrate(client, { log: (message) => console.log(message) });
  console.log(applied.length ? `Applied ${applied.length} migration(s).` : "Nothing to apply.");
} finally {
  await client.end();
}
