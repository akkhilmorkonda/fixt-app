"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SetActiveNavigate } from "@clerk/nextjs/types";

export function Field({
  label,
  error,
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-zinc-700">{label}</span>
      <input
        {...props}
        aria-invalid={!!error}
        className={`block h-11 w-full rounded-lg border border-zinc-200 bg-white px-3.5 text-sm text-[#1a1a1a] outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-500/10 ${className}`}
      />
      {error && <span className="mt-1.5 block text-xs text-rose-600">{error}</span>}
    </label>
  );
}

/** Password input with a show / hide toggle. */
export function PasswordField(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string | null }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Field {...props} type={visible ? "text" : "password"} className="pr-16" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        className="absolute right-1.5 top-[30px] h-8 rounded-md px-2.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-[#1a1a1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600/30"
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}

export function SubmitButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-black px-6 text-sm font-medium text-white transition hover:bg-[#2a2a2a] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
      {children}
    </button>
  );
}

export function GoogleButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-zinc-200 bg-white px-6 text-sm font-medium text-zinc-800 shadow-sm shadow-zinc-900/[0.03] transition hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/10"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
      </svg>
      {label}
    </button>
  );
}

export function Divider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs text-zinc-400">
      <span className="h-px flex-1 bg-zinc-200" />
      or with email
      <span className="h-px flex-1 bg-zinc-200" />
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
      {message}
    </div>
  );
}

export function TextButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="text-sm font-medium text-zinc-500 underline-offset-4 transition-colors hover:text-black hover:underline disabled:opacity-50"
    />
  );
}

export function errorMessage(err: { longMessage?: string; message: string } | null | undefined) {
  return err ? (err.longMessage ?? err.message) : null;
}

// Hands Clerk a navigate callback that lands on the app home once the session is active.
export function useFinishNavigate(): SetActiveNavigate {
  const router = useRouter();
  return ({ decorateUrl }) => {
    const url = decorateUrl("/");
    if (url.startsWith("http")) window.location.href = url;
    else router.push(url);
  };
}
