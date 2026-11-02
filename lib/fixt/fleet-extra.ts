import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { currentTenant } from "@/lib/tenant";
import type { TestDef } from "./types";

// Extra fleet reads for the drift pages. Same rules as repo.ts: the tenant
// comes from currentTenant() and every query filters by it.

/** Every test definition in the organization, with its baseline. */
export async function listTests(): Promise<TestDef[]> {
  const { tenantId } = await currentTenant();
  const { data, error } = await createAdminSupabase()
    .from("fx_tests")
    .select("id, station_id, name, unit, lsl, usl, nominal, baseline_mean, baseline_sd, baseline_at")
    .eq("tenant_id", tenantId)
    .order("name")
    .returns<TestDef[]>();
  if (error) throw new Error(`Failed to load tests: ${error.message}`);
  return data ?? [];
}
