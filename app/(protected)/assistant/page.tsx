import { requireUser } from "@/lib/auth";
import { aiUsageThisMonth, getConversation, listConversations } from "@/lib/ai/assistant";
import { aiFeatures } from "@/lib/ai/fixt";
import PageHeader from "../_ui/PageHeader";
import AssistantUI from "./AssistantUI";

export const instant = false;

/** Ask FIXT: questions about the organization's own test fleet, yield and investigations. */
export default async function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  await requireUser();
  const { c } = await searchParams;
  const [features, conversations, current, usage] = await Promise.all([
    aiFeatures(),
    listConversations(),
    typeof c === "string" ? getConversation(c) : null,
    aiUsageThisMonth().catch(() => null),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Ask FIXT" />
      {features.assistant ? (
        <AssistantUI
          key={current?.conversation.id ?? "new"}
          conversations={conversations}
          current={current ? { id: current.conversation.id, messages: current.messages } : null}
          usagePercent={usage?.percent ?? null}
        />
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-200 px-6 py-12 text-center">
          <p className="font-medium">Ask FIXT isn&apos;t turned on for your organization.</p>
          <p className="mt-1 text-sm text-zinc-500">Contact FIXT support to switch it on.</p>
        </div>
      )}
    </div>
  );
}
