"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "./icons";

/** Builds an href for the current page with one search param set or removed. */
export function useParamHref() {
  const pathname = usePathname();
  const params = useSearchParams();
  return useCallback(
    (changes: Record<string, string | null>) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(changes)) {
        if (v == null) next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname, params],
  );
}

/**
 * Right-hand panel driven by a search param (e.g. ?lead=…), so it survives
 * refreshes, works with the back button and can be linked to.
 */
export default function SlideOver({
  param,
  breadcrumb,
  status,
  children,
  footer,
}: {
  param: string;
  breadcrumb: React.ReactNode;
  status?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const router = useRouter();
  const href = useParamHref();
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => router.replace(href({ [param]: null, in: null }), { scroll: false }), [router, href, param]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement).closest("[aria-expanded=true]")) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close panel" tabIndex={-1} onClick={close} className="animate-fade-in absolute inset-0 cursor-default bg-zinc-900/10" />
      <div
        ref={panel}
        tabIndex={-1}
        className="animate-slide-in absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col border-l border-zinc-200 bg-white shadow-2xl shadow-zinc-900/10 outline-none"
      >
        <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-zinc-100 px-5">
          <div className="flex min-w-0 items-center gap-1.5 text-sm text-zinc-500">{breadcrumb}</div>
          <div className="ml-auto flex items-center gap-3">
            {status}
            <button type="button" onClick={close} aria-label="Close" className="rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-[#1a1a1a]">
              <Icon name="close" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-8 pb-10 pt-8">{children}</div>
        {footer && <div className="flex shrink-0 items-center gap-3 border-t border-zinc-100 px-8 py-3">{footer}</div>}
      </div>
    </div>
  );
}
