import { Suspense } from "react";
import AuthShell from "../../../_auth/shell";
import SessionTasks from "../../../_auth/session-tasks";

export default function SessionTasksPage() {
  return (
    <AuthShell title="One more" muted="step" subtitle="Finish setting up your account to continue.">
      <Suspense>
        <SessionTasks />
      </Suspense>
    </AuthShell>
  );
}
