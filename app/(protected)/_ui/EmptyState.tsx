export default function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-200 px-6 py-16 text-center">
      <p className="font-heading text-lg font-semibold">{title}</p>
      <p className="max-w-sm text-sm leading-6 text-zinc-500">{body}</p>
      {action}
    </div>
  );
}
