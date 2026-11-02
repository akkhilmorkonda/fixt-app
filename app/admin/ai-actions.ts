"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { updateOrgAi } from "@/lib/ai/admin";
import { parseAiSettings } from "@/lib/ai/validate";
import type { AdminResult as ActionResult } from "./actions";

// Platform admin actions for AI. lib/ai/admin.ts re-checks that the caller is a
// platform admin and writes the audit log; arguments are validated here.

const TENANT = /^[A-Za-z0-9_-]{1,64}$/;

export async function updateOrgAiAction(tenantId: unknown, input: unknown): Promise<ActionResult> {
  if (typeof tenantId !== "string" || !TENANT.test(tenantId)) return { ok: false, error: "That organization no longer exists." };
  const parsed = parseAiSettings(input);
  if ("errors" in parsed) return { ok: false, fieldErrors: parsed.errors };
  try {
    if (!(await updateOrgAi(tenantId, parsed.fields))) return { ok: false, error: "That organization no longer exists." };
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (err) {
    unstable_rethrow(err);
    console.error(err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
