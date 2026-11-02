"use client";

import { useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Icon } from "./icons";
import { MobileSidebar, type Badges } from "./Sidebar";

export default function Topbar({ badges }: { badges: Badges }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const q = useSearchParams().get("q") ?? "";
  // Clerk's UserButton renders differently before and after Clerk loads, so it only renders on the client.
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-zinc-100 bg-white/90 px-4 backdrop-blur md:px-10">
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label="Open menu"
        className="rounded-md p-1.5 text-zinc-600 hover:bg-zinc-100 md:hidden"
      >
        <Icon name="menu" />
      </button>
      <form action="/investigations" role="search" className="w-full max-w-[360px]">
        <label className="flex h-9 items-center gap-2 rounded-lg bg-zinc-100 px-3 text-sm text-zinc-500 transition focus-within:bg-white focus-within:ring-2 focus-within:ring-sky-600/30">
          <Icon name="search" />
          <input
            key={q}
            name="q"
            defaultValue={q}
            placeholder="Search investigations"
            className="w-full bg-transparent text-[#1a1a1a] outline-none placeholder:text-zinc-500"
          />
        </label>
      </form>
      <div className="ml-auto flex items-center">
        {mounted ? <UserButton /> : <div className="size-7 rounded-full bg-zinc-100" />}
      </div>
      <MobileSidebar open={menuOpen} onClose={() => setMenuOpen(false)} badges={badges} />
    </header>
  );
}

const noop = () => () => {};
