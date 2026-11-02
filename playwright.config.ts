import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against `next dev` and the local Supabase. Reuses your
// running `npm run dev` if there is one (set E2E_PORT if it isn't on 3000).
// Signed-in flows need the Clerk development instance's keys in .env.local.
const PORT = Number(process.env.E2E_PORT ?? 3000);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "signed-out", testMatch: /signed-out\.spec\.ts/, use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: `npx next dev -p ${PORT}`, url: `http://localhost:${PORT}/sign-in`, reuseExistingServer: true, timeout: 120_000 },
});
