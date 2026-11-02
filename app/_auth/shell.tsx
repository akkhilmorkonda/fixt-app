import Link from "next/link";
import { LANDING_URL, Logo } from "./brand";

// Frame for the sign-in / sign-up flows: the form on the left, and on large
// screens a dark brand panel on the right with a glimpse of the product.
export default function AuthShell({
  title,
  muted,
  subtitle,
  footer,
  children,
}: {
  title: string;
  muted?: string;
  subtitle: string;
  footer?: { text: string; href?: string; label?: string };
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh flex-1 bg-white font-sans text-[#1a1a1a] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-w-0 flex-col px-4 sm:px-10">
        <header className="flex h-16 items-center sm:h-20">
          <a href={LANDING_URL} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600/40">
            <Logo />
          </a>
        </header>

        <main className="flex flex-1 items-center justify-center py-10">
          <div className="animate-fade-up flex w-full max-w-[380px] flex-col gap-8">
            <div className="flex flex-col gap-2">
              <h1 className="font-heading text-[32px] font-semibold leading-tight tracking-tight">
                {title}
                {muted && (
                  <>
                    {" "}
                    <span className="italic text-sky-600">{muted}</span>
                  </>
                )}
              </h1>
              <p className="text-[15px] leading-6 text-zinc-500">{subtitle}</p>
            </div>
            {children}
            {footer && (
              <p className="border-t border-zinc-100 pt-6 text-sm leading-6 text-zinc-500">
                {footer.text}
                {footer.href && (
                  <>
                    {" "}
                    <Link href={footer.href} className="font-medium text-[#1a1a1a] underline-offset-4 hover:underline">
                      {footer.label}
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        </main>

        <footer className="flex h-16 items-center text-xs text-zinc-400">&copy; 2026 FIXT</footer>
      </div>

      <BrandPanel />
    </div>
  );
}

const PREVIEW = [
  { station: "FRE1 FCT-3", status: "Drift", dot: "bg-rose-400", note: "HR LED +1.4 mA · fixture", value: "Awaiting approval" },
  { station: "PEN1 ICT-1", status: "Root caused", dot: "bg-emerald-400", note: "LDO lot LDO-2241", value: "18h to root cause" },
  { station: "FRE2 EOL-1", status: "False failures", dot: "bg-amber-400", note: "92% pass on retest", value: "Sequence fix proposed" },
];

function BrandPanel() {
  return (
    <aside aria-hidden className="relative m-3 hidden overflow-hidden rounded-2xl bg-[#0c0c0d] text-white lg:flex lg:flex-col">
      {/* Faint blueprint grid. */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(ellipse at 30% 20%, #000 20%, transparent 75%)",
        }}
      />
      <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />

      <div className="relative flex flex-1 flex-col justify-between gap-12 p-12 xl:p-16">
        <div className="flex max-w-md flex-col gap-4">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-sky-400">AI agents for manufacturing test</span>
          <p className="font-heading text-4xl font-semibold leading-[1.1] tracking-tight xl:text-[44px]">
            Catch drift. Find root cause. <span className="italic text-zinc-400">In a day, not a week.</span>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {PREVIEW.map((c) => (
            <div key={c.station} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 backdrop-blur">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-medium">
                  {c.station} <span className="text-zinc-400">· {c.status}</span>
                </span>
                <span className="truncate text-[11px] text-zinc-400">{c.note}</span>
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-zinc-200">{c.value}</span>
            </div>
          ))}
        </div>

        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-400">
          {["Fleet health", "Root cause", "Bring-up"].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-sky-400" />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
