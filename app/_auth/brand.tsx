// Brand pieces for the FIXT auth pages.

export const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL ?? "/";

export function Logo() {
  return <span className="font-heading text-lg font-semibold tracking-tight">FIXT</span>;
}
