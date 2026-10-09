import { expect, test } from "@playwright/test";

/** A Monday–Saturday date about a month out, clear of the seeded schedule. */
function openDateInAMonth(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

test("a customer can request a booking and staff can see it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Request a booking" }).click();
  await expect(page.getByRole("heading", { name: "Request a booking" })).toBeVisible();

  // Submitting an empty form shows validation messages instead of calling the server.
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Please choose a service.")).toBeVisible();

  await page.getByText("Standard service visit").click();
  await page.getByLabel("Date").fill(openDateInAMonth());
  await page.getByLabel("Start time").selectOption("10:00");
  await page.getByLabel("Full name").fill("Robin Playwright");
  await page.getByLabel("Email").fill("robin.playwright@example.com");
  await page.getByLabel("Service address").fill("1 Test Lane, Springfield");
  await page.getByRole("button", { name: "Confirm booking" }).click();

  const confirmation = page.getByTestId("booking-confirmation");
  await expect(confirmation.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
  const reference = (await confirmation.getByText(/^BK-/).textContent())!.trim();

  // Staff can find it.
  await page.goto(`/bookings?q=${reference}`);
  await page.getByLabel("Email").fill("staff@example.com");
  await page.getByLabel("Password").fill("staff-demo-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`/bookings\\?q=${reference}`));
  await expect(page.getByRole("link", { name: reference })).toBeVisible();
});

test("staff can start a scheduled job; only admins may cancel", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("listitem").filter({ hasText: "Staff" }).getByRole("button", { name: "Use" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Bookings" }).click();
  await page.getByRole("navigation", { name: "Filter by status" }).getByRole("link", { name: "Scheduled" }).click();
  await page.locator("table").getByRole("link", { name: /^BK-/ }).first().click();

  await expect(page.getByRole("button", { name: "Cancel job" })).toBeDisabled();
  await expect(page.getByText("Only admins can cancel jobs.")).toBeVisible();

  await page.getByRole("button", { name: "Start job" }).click();
  await expect(page.getByRole("button", { name: "Mark completed" })).toBeVisible();
  await expect(page.getByText("Scheduled → In progress")).toBeVisible();
});

test("staff pages redirect to sign-in and come back afterwards", async ({ page }) => {
  await page.goto("/customers");
  await expect(page).toHaveURL(/\/login\?next=%2Fcustomers/);
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();

  await page.getByLabel("Password").fill("admin-demo-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
});
