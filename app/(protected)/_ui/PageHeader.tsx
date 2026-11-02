export default function PageHeader({
  title,
  kicker,
  actions,
}: {
  title: React.ReactNode;
  kicker?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        {kicker && <span className="text-xs font-medium uppercase tracking-widest text-zinc-500">{kicker}</span>}
        <h1 className="font-heading text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
      </div>
      {actions}
    </div>
  );
}
