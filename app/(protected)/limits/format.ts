import { TARGET_CPK } from "@/lib/fixt/capability";

/** Color for a capability index: red below 1, amber below the target, green above. */
export function capTone(v: number | null) {
  if (v == null) return "text-zinc-400";
  if (v < 1) return "font-medium text-rose-600";
  if (v < TARGET_CPK) return "text-amber-700";
  return "text-emerald-700";
}

/** Parts per million, readable at both ends: "< 0.01", "3.4", "2,700". */
export function ppm(v: number) {
  if (v < 0.01) return "< 0.01";
  if (v < 10) return v.toFixed(2);
  return Math.round(v).toLocaleString("en-US");
}

/** "p = 0.034", "p < 0.001". */
export function pValue(p: number) {
  return p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`;
}
