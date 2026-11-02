import { Suspense } from "react";
import SSOCallback from "./sso-callback";

export default function SSOCallbackPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-zinc-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-black" />
        Signing you in…
      </div>
      <Suspense>
        <SSOCallback />
      </Suspense>
    </main>
  );
}
