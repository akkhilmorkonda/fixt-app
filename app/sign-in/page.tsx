import { Suspense } from "react";
import AuthShell from "../_auth/shell";
import SignInForm from "../_auth/sign-in-form";

export default function SignInPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your FIXT account."
      footer={{ text: "New to FIXT? Continue with Google to create your account." }}
    >
      <Suspense>
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}
