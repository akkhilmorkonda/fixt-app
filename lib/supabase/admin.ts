import "server-only";
import { createClient } from "@supabase/supabase-js";

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

/**
 * Privileged Supabase client that BYPASSES Row Level Security. Server-only.
 * Only lib/crm/* and lib/quickbooks/* may use it, and every query there is scoped by tenant.
 */
export function createAdminSupabase() {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
