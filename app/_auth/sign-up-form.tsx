"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSignUp } from "@clerk/nextjs";
import { FormError, PasswordField, SubmitButton, errorMessage, useFinishNavigate } from "./ui";

// FIXT is invite-only (Clerk access mode). An invitation link carries a
// __clerk_ticket; without one there is nothing to sign up with.
export default function SignUpForm() {
  const ticket = useSearchParams().get("__clerk_ticket");
  const { signUp, errors, fetchStatus } = useSignUp();
  const navigate = useFinishNavigate();
  const [password, setPassword] = useState("");

  const loading = fetchStatus === "fetching";
  const globalError = errorMessage(errors.global?.[0]);

  if (!ticket) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex gap-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
          <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
          <p className="text-sm leading-6 text-zinc-600">
            <span className="font-medium text-[#1a1a1a]">FIXT is invite-only.</span> Open the invitation link from your email to create your
            account.
          </p>
        </div>
        <Link
          href="/sign-in"
          className="flex h-11 w-full items-center justify-center rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50"
        >
          Already have an account? Sign in
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The ticket proves the invited email address, so no verification code is needed.
    const { error } = await signUp.create({ strategy: "ticket", ticket: ticket!, password });
    if (!error && signUp.status === "complete") await signUp.finalize({ navigate });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-sm leading-6 text-zinc-600">You&apos;ve been invited to FIXT. Choose a password to finish setting up your account.</p>
      <PasswordField
        label="Password"
        autoComplete="new-password"
        required
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.fields.password?.message}
      />
      <FormError message={globalError} />
      {/* Clerk mounts its bot-protection challenge here when required. */}
      <div id="clerk-captcha" />
      <SubmitButton loading={loading}>Create account</SubmitButton>
    </form>
  );
}
