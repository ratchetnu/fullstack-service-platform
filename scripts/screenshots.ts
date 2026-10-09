/**
 * Regenerates the README screenshots, the same way every time.
 *
 *   npm run build && npm run screenshots
 *
 * It resets a separate database (never your development one), seeds it and
 * starts the production server with a demo clock set to 11:30 on the next
 * Tuesday, US Eastern time. The screenshots therefore always show a working
 * day in progress, whenever they are taken.
 */
import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { BUSINESS } from "../src/shared/business-rules";
import { addDays, getZonedParts, toLocalDate, zonedTimeToUtc } from "../src/shared/time";
import { loadEnv } from "./env";

loadEnv();
const DATABASE_URL =
  process.env.SCREENSHOT_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/service_platform_screenshots";
const PORT = 3300;
const BASE_URL = `http://localhost:${PORT}`;
const OUT = "docs/screenshots";

function nextTuesdayMorning(): { now: Date; date: string } {
  let date = addDays(toLocalDate(new Date(), BUSINESS.timeZone), 1);
  while (getZonedParts(zonedTimeToUtc(date, "12:00", BUSINESS.timeZone), BUSINESS.timeZone).weekday !== 2) {
    date = addDays(date, 1);
  }
  return { now: zonedTimeToUtc(date, "11:30", BUSINESS.timeZone), date };
}

const demo = nextTuesdayMorning();
const env = {
  ...process.env,
  DATABASE_URL,
  DEMO_NOW: String(demo.now.getTime()),
  NODE_OPTIONS: `--require ${path.resolve("scripts/demo-clock.cjs")}`,
};

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`))));
  });
}

async function waitForHealth(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`${BASE_URL}/api/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Server did not become healthy");
}

async function shoot(page: Page, url: string, file: string) {
  await page.goto(`${BASE_URL}${url}`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
  console.log(`saved ${OUT}/${file}`);
}

console.log(`Demo clock: ${demo.date} 11:30 (${BUSINESS.timeZone})`);
await run("npx", ["tsx", "scripts/reset.ts"]);

let server: ChildProcess | undefined;
const browser = await chromium.launch();
try {
  // Own process group, so stopping it also stops the Next.js child process.
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { env, stdio: "ignore", detached: true });
  await waitForHealth();

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  // A partly completed booking form.
  await desktop.goto(`${BASE_URL}/book`);
  await desktop.getByText("Standard service visit").click();
  await desktop.getByLabel("Date").fill(addDays(demo.date, 7));
  await desktop.getByLabel("Start time").selectOption("10:00");
  await desktop.getByLabel("Full name").fill("Robin Example");
  await desktop.getByLabel("Email").fill("robin@example.com");
  await desktop.screenshot({ path: `${OUT}/booking-form.png`, fullPage: true });
  console.log(`saved ${OUT}/booking-form.png`);

  await desktop.goto(`${BASE_URL}/login`);
  await desktop.getByLabel("Email").fill("admin@example.com");
  await desktop.getByLabel("Password").fill("admin-demo-password");
  await desktop.getByRole("button", { name: "Sign in" }).click();
  await desktop.waitForURL(/\/dashboard/);

  await shoot(desktop, "/dashboard", "dashboard.png");
  await shoot(desktop, "/bookings", "bookings.png");

  // The job running right now: shows the action buttons and a history with a staff member.
  await desktop.goto(`${BASE_URL}/bookings?status=in_progress`);
  const bookingHref = await desktop.locator("table").getByRole("link", { name: /^BK-/ }).first().getAttribute("href");
  await shoot(desktop, bookingHref!, "booking-detail.png");

  // The customer with the longest history makes the most useful example.
  await desktop.goto(`${BASE_URL}/customers`);
  const customerHref = await desktop.locator("tbody tr").evaluateAll((rows) => {
    const ranked = rows
      .map((row) => ({
        href: row.querySelector("a")?.getAttribute("href") ?? "",
        count: Number(row.querySelectorAll("td")[3]?.textContent ?? 0),
      }))
      .sort((a, b) => b.count - a.count);
    return ranked[0]?.href ?? "";
  });
  await shoot(desktop, customerHref, "customer-detail.png");

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await mobile.context().addCookies(await desktop.context().cookies());
  await shoot(mobile, "/dashboard", "dashboard-mobile.png");
} finally {
  await browser.close();
  if (server?.pid) process.kill(-server.pid, "SIGTERM");
}
