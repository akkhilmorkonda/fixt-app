"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { OrganizationProfile } from "@clerk/nextjs";
import { ROLES, type Role } from "@/lib/fixt/types";
import { setRoleAction } from "../_actions/fixt";
import { Card } from "../_ui/kit";

export function RoleSelect({ userId, role, disabled }: { userId: string; role: Role; disabled: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1">
      <select
        value={value}
        disabled={disabled || pending}
        aria-label="FIXT role"
        onChange={(e) => {
          const next = e.target.value as Role;
          setValue(next);
          start(async () => {
            const r = await setRoleAction(userId, next);
            setError(r.ok ? null : r.error);
            if (!r.ok) setValue(role);
            else router.refresh();
          });
        }}
        className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-sm disabled:opacity-60"
      >
        {ROLES.map((r) => (
          <option key={r.key} value={r.key}>
            {r.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </div>
  );
}

/** Invitations, verified domains and SSO live in Clerk's organization profile. */
export function InviteAndSso() {
  const [open, setOpen] = useState(false);
  return (
    <Card
      title="Invite people, domains & SSO"
      actions={
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-sky-600 hover:underline">
          {open ? "Hide" : "Open"}
        </button>
      }
    >
      {open ? (
        <div className="overflow-x-auto p-4">
          <OrganizationProfile routing="hash" />
        </div>
      ) : (
        <p className="px-4 py-5 text-sm text-zinc-500">Invite teammates or contract manufacturer partners by email, verify your company domain, and connect single sign-on.</p>
      )}
    </Card>
  );
}
