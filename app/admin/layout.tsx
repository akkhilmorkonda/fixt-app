import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { requireAdmin } from "@/lib/tenant";

// Platform admin area: every organization. Outside the app's (protected)
// group because an admin may not belong to any organization. requireAdmin()
// 404s for everyone else; each page and action checks again.
export const instant = false;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  return (
    <div className="min-h-dvh bg-white font-sans text-[#1a1a1a]">
      <header className="sticky top-0 z-20 flex h-[60px] items-center gap-4 border-b border-zinc-200 bg-[#fcfcfc]/95 px-4 backdrop-blur md:px-10">
        <Link href="/admin" className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#1a1a1a] font-heading text-xs font-semibold text-white">F</span>
          <span className="font-heading text-sm font-semibold tracking-tight">FIXT Admin</span>
        </Link>
        <span className="ml-auto hidden text-xs text-zinc-500 sm:inline">{admin.email}</span>
        <UserButton />
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 md:px-10">{children}</main>
    </div>
  );
}
