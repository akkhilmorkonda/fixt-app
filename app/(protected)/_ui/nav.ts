import type { IconName } from "./icons";

// The app's navigation, shared by the sidebar and the placeholder pages.

export type NavLink = { href: string; label: string; icon: IconName; description?: string; badge?: "approvals" | "issues" };
export type NavGroup = { label: string; icon: IconName; children: { href: string; label: string; description?: string; badge?: "approvals" | "issues" }[] };
export type NavItem = NavLink | NavGroup;
export type NavSection = { title: string; items: NavItem[] };

export const isGroup = (item: NavItem): item is NavGroup => "children" in item;

export const TOP_NAV: NavLink[] = [
  { href: "/", label: "Fleet", icon: "fleet" },
  { href: "/assistant", label: "Ask FIXT", icon: "sparkle" },
  { href: "/investigations", label: "Investigations", icon: "investigation" },
  { href: "/approvals", label: "Approvals", icon: "approval", badge: "approvals" },
];

export const SECTIONS: NavSection[] = [
  {
    title: "Monitor",
    items: [
      { href: "/stations", label: "Stations", icon: "station" },
      { href: "/drift", label: "Drift & anomalies", icon: "drift", badge: "issues" },
    ],
  },
  {
    title: "Agents",
    items: [
      {
        label: "Agent control",
        icon: "agent",
        children: [
          { href: "/agents", label: "Autonomy & trust" },
          { href: "/agents/audit", label: "Audit log" },
        ],
      },
    ],
  },
  {
    title: "Engineering",
    items: [
      { href: "/limits", label: "Limits & capability", icon: "capability" },
      { href: "/bringup", label: "Bring-up", icon: "bringup" },
      { href: "/handoffs", label: "Shift handoffs", icon: "handoff" },
    ],
  },
  {
    title: "Insights",
    items: [
      { href: "/analytics", label: "Analytics", icon: "analytics" },
      { href: "/roi", label: "ROI", icon: "dollar" },
    ],
  },
  {
    title: "Admin",
    items: [
      { href: "/integrations", label: "Integrations", icon: "plug" },
      { href: "/alerts", label: "Alert routing", icon: "bell" },
      { href: "/team", label: "Team & roles", icon: "users" },
      { href: "/settings", label: "Settings", icon: "settings" },
    ],
  },
];

/** Every page that isn't built yet, keyed by path, for the "coming soon" screens. */
export const PLACEHOLDERS: Record<string, { title: string; section: string; description: string }> = Object.fromEntries([
  ...TOP_NAV.filter((l) => l.description).map((l) => [l.href, { title: l.label, section: "", description: l.description! }]),
  ...SECTIONS.flatMap((s) =>
    s.items.flatMap((item) =>
      isGroup(item)
        ? item.children.filter((c) => c.description).map((c) => [c.href, { title: c.label, section: s.title, description: c.description! }])
        : item.description
          ? [[item.href, { title: item.label, section: s.title, description: item.description }]]
          : [],
    ),
  ),
]);

/** Label for any app path, used by the Shortcuts list. */
export function labelFor(href: string): { label: string; icon: IconName } | null {
  for (const l of TOP_NAV) if (l.href === href) return l;
  for (const s of SECTIONS)
    for (const item of s.items) {
      if (!isGroup(item)) {
        if (item.href === href) return item;
      } else {
        const child = item.children.find((c) => c.href === href);
        if (child) return { label: child.label, icon: item.icon };
      }
    }
  return null;
}
