import { existsSync } from "node:fs";
import pg from "pg";

/** Scripts run outside Next.js, so load .env ourselves (Node 22 built-in). */
export function loadEnv(): void {
  if (existsSync(".env")) process.loadEnvFile(".env");
}

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env or export it.");
    process.exit(1);
  }
  return url;
}

export function refuseInProduction(action: string): void {
  if (process.env.NODE_ENV === "production") {
    console.error(`Refusing to ${action} with NODE_ENV=production.`);
    process.exit(1);
  }
}

export async function connect(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return client;
}
