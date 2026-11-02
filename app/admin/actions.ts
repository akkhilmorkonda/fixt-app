"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { AdminError, createOrganization, syncOrganizationsFromClerk, updateOrganization } from "@/lib/admin";
import { parseNewOrganization, parseOrganization } from "@/lib/admin-validate";
import { startActingAs, stopActingAs } from "@/lib/tenant";

// Platform admin actions. Each lib/admin.ts function re-checks that the caller
// is a platform admin and writes the audit log; arguments are validated here.

export type AdminResult = { ok: true; id?: string } | { ok: false; error?: string; fieldErrors?: Record<string, string> };

const TENANT = /^[A-Za-z0-9_-]{1,64}$/;
const isTenant = (v: unknown): v is string => typeof v === "string" && TENANT.test(v);
const NOT_FOUND: AdminResult = { ok: false, error: "That no longer exists. Refresh the page." };

async function run(fn: () => Promise<AdminResult>): Promise<AdminResult> {
  try {
    const result = await fn();
    if (result.ok) revalidatePath("/admin", "layout");
    return result;
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof AdminError) return { ok: false, error: err.message };
    const clerk = (err as { errors?: { longMessage?: string; message?: string }[] })?.errors?.[0];
    if (clerk) return { ok: false, error: clerk.longMessage ?? clerk.message ?? "Clerk rejected that" };
    console.error(err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function syncOrganizationsAction() {
  return run(async () => ({ ok: true, id: String(await syncOrganizationsFromClerk()) }));
}

export async function createOrganizationAction(input: unknown) {
  const parsed = parseNewOrganization(input);
  if ("errors" in parsed) return { ok: false, fieldErrors: parsed.errors } satisfies AdminResult;
  return run(async () => ({ ok: true, id: await createOrganization(parsed.fields) }));
}

export async function updateOrganizationAction(id: unknown, input: unknown) {
  if (!isTenant(id)) return NOT_FOUND;
  const parsed = parseOrganization(input);
  if ("errors" in parsed) return { ok: false, fieldErrors: parsed.errors } satisfies AdminResult;
  return run(async () => ((await updateOrganization(id, parsed.fields)) ? { ok: true } : NOT_FOUND));
}

/** Opens the organization in the normal app, as an admin. */
export async function openOrganizationAction(id: unknown) {
  if (!isTenant(id)) notFound();
  await startActingAs(id);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function exitOrganizationAction() {
  await stopActingAs();
  revalidatePath("/", "layout");
  redirect("/admin");
}
