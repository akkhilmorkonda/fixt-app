import { expect, test } from "@playwright/test";

// What someone without a session can and can't reach.

test("app pages send you to sign in", async ({ page }) => {
  for (const path of ["/", "/investigations", "/approvals", "/roi"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
  }
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});

test("ingest needs a connector key", async ({ request }) => {
  const res = await request.post("/api/ingest", { data: [{ station: "S", test: "t", value: 1 }] });
  expect(res.status()).toBe(401);
  const bad = await request.post("/api/ingest", { data: [], headers: { Authorization: "Bearer fxk_notarealkeynotarealkey" } });
  expect(bad.status()).toBe(401);
});

test("the scheduler needs its secret", async ({ request }) => {
  expect((await request.get("/api/cron/weekly-summary")).status()).toBe(401);
});

test("an unknown share link is a 404, not a sign-in page", async ({ page }) => {
  const res = await page.goto(`/share/${"x".repeat(32)}`);
  expect(res?.status()).toBe(404);
});
