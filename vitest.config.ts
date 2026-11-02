import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Forward slashes, so the "@/" alias also resolves on Windows.
const root = fileURLToPath(new URL(".", import.meta.url)).replaceAll("\\", "/");

export default defineConfig({
  resolve: {
    alias: {
      "@/": root,
      // "server-only" throws outside a React Server Component bundle.
      "server-only": `${root}tests/support/empty.ts`,
    },
  },
  test: {
    env: { TZ: "UTC" },
    // Integration files share one local database; keep runs sequential.
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        // Runs against the local Supabase from `supabase start`; refuses any other database.
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/support/local-env.ts"],
          testTimeout: 20_000,
        },
      },
    ],
  },
});
