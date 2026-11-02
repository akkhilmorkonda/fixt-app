"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useOrganization, useUser } from "@clerk/nextjs";
import { Icon, type IconName } from "./icons";
import { SECTIONS, TOP_NAV, isGroup, labelFor, type NavGroup } from "./nav";

/** Per-request sidebar extras: counts, the Admin link, and the organization an admin has opened. */
export type Badges = { approvals: number; issues: number; isAdmin?: boolean; workspace?: string | null };

// Layout follows a 240px sidebar with 20px gutters: 30px rows, 14px labels,
// 16px icons with a 12px gap, 12px section headings and 28px between groups.

const ROW = "flex h-[30px] w-full items-center gap-3 rounded-md px-1 text-sm transition-colors";
const SHORTCUTS_KEY = "fixt:shortcuts";
const MAX_SHORTCUTS = 4;

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

function NavRow({ href, label, icon, active, badge }: { href: string; label: string; icon?: IconName; active: boolean; badge?: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${ROW} ${icon ? "" : "pl-8"} ${
        active ? "font-semibold text-sky-600" : "text-zinc-700 hover:bg-zinc-100 hover:text-[#1a1a1a]"
      }`}
    >
      {icon && <Icon name={icon} className={active ? "text-sky-600" : "text-zinc-500"} />}
      <span className="truncate">{label}</span>
      {!!badge && (
        <span className="ml-auto rounded-full bg-violet-100 px-1.5 text-[11px] font-semibold leading-[18px] tabular-nums text-violet-700" aria-label={`${badge} pending`}>
          {badge}
        </span>
      )}
    </Link>
  );
}

function Group({ group, pathname, badges }: { group: NavGroup; pathname: string; badges: Badges }) {
  const containsActive = group.children.some((c) => pathname === c.href);
  const [open, setOpen] = useState(containsActive);
  const [prevActive, setPrevActive] = useState(containsActive);
  if (containsActive !== prevActive) {
    setPrevActive(containsActive);
    if (containsActive) setOpen(true);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`${ROW} ${open ? "bg-zinc-100/70" : ""} text-zinc-700 hover:bg-zinc-100 hover:text-[#1a1a1a]`}
      >
        <Icon name={group.icon} className={containsActive ? "text-sky-600" : "text-zinc-500"} />
        <span className={`truncate ${containsActive ? "font-semibold text-sky-600" : ""}`}>{group.label}</span>
        <Icon name="chevron" className={`ml-auto h-3 w-3 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="flex flex-col">
          {group.children.map((c) => (
            <NavRow key={c.href} href={c.href} label={c.label} active={pathname === c.href} badge={c.badge ? badges[c.badge] : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[26px] items-center text-xs text-zinc-500">{children}</div>;
}

// Recently visited pages (outside the top links), remembered per browser.
function useShortcuts(pathname: string) {
  const [shortcuts, setShortcuts] = useState<string[]>([]);
  useEffect(() => {
    let stored: string[] = [];
    try {
      stored = JSON.parse(localStorage.getItem(SHORTCUTS_KEY) ?? "[]");
    } catch {}
    const valid = stored.filter((h) => typeof h === "string" && labelFor(h));
    // Only new pages join (at the top); revisiting one keeps the list in place so it doesn't jump on click.
    const next =
      labelFor(pathname) && !TOP_NAV.some((l) => l.href === pathname) && !valid.includes(pathname)
        ? [pathname, ...valid].slice(0, MAX_SHORTCUTS)
        : valid;
    try {
      localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(next));
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after mount
    setShortcuts(next);
  }, [pathname]);
  return shortcuts;
}

function Workspace({ override }: { override?: string | null }) {
  const { organization } = useOrganization();
  const { user } = useUser();
  const name = override ?? organization?.name ?? user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Workspace";
  return (
    <div className="flex h-[60px] items-center gap-3 px-1">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#1a1a1a] font-heading text-xs font-semibold text-white">
        {name.charAt(0).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="font-heading text-xs font-semibold tracking-tight text-[#1a1a1a]">FIXT</span>
        <span className="truncate text-sm text-zinc-600">{name}</span>
      </div>
    </div>
  );
}

export function SidebarNav({ badges, onNavigate }: { badges: Badges; onNavigate?: () => void }) {
  const pathname = usePathname();
  const shortcuts = useShortcuts(pathname);

  return (
    <nav className="flex flex-col gap-7 pb-12" onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate?.()}>
      <div className="flex flex-col">
        {TOP_NAV.map((l) => (
          <NavRow key={l.href} {...l} active={isActive(pathname, l.href)} badge={l.badge ? badges[l.badge] : undefined} />
        ))}
      </div>

      {shortcuts.length > 0 && (
        <div className="flex flex-col">
          <SectionHeading>Shortcuts</SectionHeading>
          {shortcuts.map((href) => (
            <NavRow key={href} href={href} label={labelFor(href)!.label} icon="clock" active={pathname === href} />
          ))}
        </div>
      )}

      {SECTIONS.map((section) => (
        <div key={section.title} className="flex flex-col">
          <SectionHeading>{section.title}</SectionHeading>
          {section.items.map((item) =>
            isGroup(item) ? (
              <Group key={item.label} group={item} pathname={pathname} badges={badges} />
            ) : (
              <NavRow key={item.href} {...item} active={isActive(pathname, item.href)} badge={item.badge ? badges[item.badge] : undefined} />
            ),
          )}
        </div>
      ))}

      {badges.isAdmin && (
        <div className="flex flex-col">
          <SectionHeading>FIXT</SectionHeading>
          <NavRow href="/admin" label="Admin" icon="company" active={false} />
        </div>
      )}
    </nav>
  );
}

export default function Sidebar({ badges }: { badges: Badges }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-zinc-200/80 bg-[#fcfcfc] px-5 md:flex">
      <Workspace override={badges.workspace} />
      <div className="pt-4">
        <SidebarNav badges={badges} />
      </div>
    </aside>
  );
}

export function MobileSidebar({ open, onClose, badges }: { open: boolean; onClose: () => void; badges: Badges }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button type="button" aria-label="Close menu" onClick={onClose} className="absolute inset-0 bg-black/20" />
      <aside className="absolute inset-y-0 left-0 flex w-64 flex-col overflow-y-auto bg-[#fcfcfc] px-5 shadow-xl">
        <div className="flex items-center justify-between">
          <Workspace override={badges.workspace} />
          <button type="button" onClick={onClose} aria-label="Close menu" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100">
            <Icon name="close" />
          </button>
        </div>
        <div className="pt-4">
          <SidebarNav badges={badges} onNavigate={onClose} />
        </div>
      </aside>
    </div>
  );
}
