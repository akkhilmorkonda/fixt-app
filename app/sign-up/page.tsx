import { Suspense } from "react";
import AuthShell from "../_auth/shell";
import SignUpForm from "../_auth/sign-up-form";

export default function SignUpPage() {
  return (
    <AuthShell
      title="Join"
      muted="FIXT"
      subtitle="Set up your account to get your test team on board."
    >
      <Suspense>
        <SignUpForm />
      </Suspense>
    </AuthShell>
  );
}
