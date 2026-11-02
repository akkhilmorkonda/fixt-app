// Loads .env.local (Next skips it when NODE_ENV=test), then refuses to touch anything but a local database.
process.loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  throw new Error(
    "Integration tests only run against the local Supabase (`supabase start`). " +
      "Point NEXT_PUBLIC_SUPABASE_URL at http://127.0.0.1:<port> in .env.local.",
  );
}
if (!process.env.SUPABASE_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY is not set");

// Organizations a test file made with testTenant() exist before its first test.
import { beforeAll } from "vitest";
import { tenantsReady } from "./db";
beforeAll(tenantsReady);
