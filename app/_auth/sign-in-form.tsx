"use client";

import { useState } from "react";
import { useSignIn } from "@clerk/nextjs";
import { Divider, Field, FormError, GoogleButton, PasswordField, SubmitButton, TextButton, errorMessage, useFinishNavigate } from "./ui";

export default function SignInForm() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const navigate = useFinishNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const loading = fetchStatus === "fetching";
  const needsCode = needsCodeStatus(signIn.status);
  const globalError = errorMessage(errors.global?.[0]);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await signIn.password({ emailAddress: email, password });
    if (error) return;
    if (signIn.status === "complete") await signIn.finalize({ navigate });
    else if (needsCodeStatus(signIn.status)) await signIn.mfa.sendEmailCode();
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await signIn.mfa.verifyEmailCode({ code });
    if (!error && signIn.status === "complete") await signIn.finalize({ navigate });
  }

  function google() {
    signIn.sso({ strategy: "oauth_google", redirectUrl: "/", redirectCallbackUrl: "/sso-callback" });
  }

  if (needsCode) {
    return (
      <form onSubmit={handleCode} className="space-y-5">
        <p className="text-sm text-zinc-600">
          We sent a 6-digit code to <span className="font-medium text-[#1a1a1a]">{email || "your email"}</span>.
        </p>
        <Field
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          error={errors.fields.code?.message}
        />
        <FormError message={globalError} />
        <SubmitButton loading={loading}>Verify and continue</SubmitButton>
        <div className="flex justify-between">
          <TextButton onClick={() => signIn.mfa.sendEmailCode()} disabled={loading}>Resend code</TextButton>
          <TextButton onClick={() => signIn.reset()}>Start over</TextButton>
        </div>
      </form>
    );
  }

  return (
    <div>
      <GoogleButton onClick={google} label="Continue with Google" />
      <Divider />
      <form onSubmit={handlePassword} className="space-y-5">
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.fields.identifier?.message}
        />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.fields.password?.message}
        />
        <FormError message={globalError} />
        <SubmitButton loading={loading}>Sign in</SubmitButton>
      </form>
    </div>
  );
}

// Clerk asks for an emailed code when signing in from a new device or with MFA on.
function needsCodeStatus(status: string) {
  return status === "needs_second_factor" || status === "needs_client_trust";
}
