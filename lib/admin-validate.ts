// Validation for platform-admin input about organizations. Pure, so tests cover it.

type Result<T> = { fields: T } | { errors: Record<string, string> };

export type OrganizationFields = {
  name: string;
  status: "active" | "suspended" | "archived";
  status_reason: string | null;
  admin_notes: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : null);

export function parseNewOrganization(input: unknown): Result<{ name: string; owner_email: string | null }> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { errors: { form: "Invalid request" } };
  const o = input as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const name = str(o.name);
  const email = str(o.owner_email);
  if (!name) errors.name = "Give it a name";
  else if (name.length > 120) errors.name = "Keep it under 120 characters";
  if (email === null || (email && (!EMAIL.test(email) || email.length > 320))) errors.owner_email = "Enter a valid email address";
  if (Object.keys(errors).length) return { errors };
  return { fields: { name: name!, owner_email: email ? email.toLowerCase() : null } };
}

export function parseOrganization(input: unknown): Result<OrganizationFields> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { errors: { form: "Invalid request" } };
  const o = input as Record<string, unknown>;
  const errors: Record<string, string> = {};
  const name = str(o.name);
  if (name === null || name.length > 120) errors.name = "Keep it under 120 characters";
  const status = o.status;
  if (status !== "active" && status !== "suspended" && status !== "archived") errors.status = "Pick a status";
  const reason = str(o.status_reason);
  if (reason === null || reason.length > 500) errors.status_reason = "Keep it under 500 characters";
  const notes = str(o.admin_notes);
  if (notes === null || notes.length > 5000) errors.admin_notes = "Keep it under 5,000 characters";
  if (Object.keys(errors).length) return { errors };
  return {
    fields: {
      name: name!,
      status: status as OrganizationFields["status"],
      status_reason: status === "active" ? null : reason || null,
      admin_notes: notes || null,
    },
  };
}
