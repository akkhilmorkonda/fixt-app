"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@clerk/nextjs";
import { TaskChooseOrganization, TaskResetPassword, TaskSetupMFA } from "@clerk/nextjs";
import { clerkAppearance } from "./appearance";

// Steps Clerk can require after sign-in before the session is active, e.g.
// picking an organization when the instance requires one.
export default function SessionTasks() {
  const router = useRouter();
  const { isLoaded, session } = useSession();
  const task = session?.currentTask?.key;

  useEffect(() => {
    if (!isLoaded) return;
    if (!session) router.replace("/sign-in");
    else if (!task) router.replace("/");
  }, [isLoaded, session, task, router]);

  const props = { redirectUrlComplete: "/", appearance: clerkAppearance };
  if (task === "choose-organization") return <TaskChooseOrganization {...props} />;
  if (task === "reset-password") return <TaskResetPassword {...props} />;
  if (task === "setup-mfa") return <TaskSetupMFA {...props} />;
  return (
    <div className="flex items-center justify-center gap-3 py-6 text-sm text-zinc-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-black" />
      Loading…
    </div>
  );
}
