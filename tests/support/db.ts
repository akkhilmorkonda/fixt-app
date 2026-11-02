import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const db = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

// Every tenant-owned row needs its organization in `tenants`. Ids made at the
// top of a test file are registered before its tests run (tests/support/local-env.ts);
// inside a test, use newTenant().
const pending: Promise<void>[] = [];

const register = async (id: string) => {
  const { error } = await db().from("tenants").insert({ id, name: id });
  if (error) throw new Error(`Failed to create test tenant: ${error.message}`);
};

/** A throwaway organization id, so tests never see each other's rows. */
export const testTenant = (label = "t") => {
  const id = `test_${label}_${randomUUID()}`;
  pending.push(register(id));
  return id;
};

/** Waits for every testTenant() so far to exist. */
export const tenantsReady = async () => {
  await Promise.all(pending.splice(0));
};

/** A throwaway organization, created now. */
export const newTenant = async (label = "t") => {
  const id = `test_${label}_${randomUUID()}`;
  await register(id);
  return id;
};

/** Removes a test organization and, through the cascades, every row it owns. */
export async function dropTenant(tenantId: string) {
  const client = db();
  await client.from("tenants").update({ status: "archived" }).eq("id", tenantId);
  const { error } = await client.from("tenants").delete().eq("id", tenantId);
  if (error) throw new Error(`Failed to drop test tenant: ${error.message}`);
}
