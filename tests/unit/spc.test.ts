import { describe, expect, it } from "vitest";
import { controlLimits, cpk, detectDrift, driftSeverity, histogram, mean, stdev } from "@/lib/fixt/spc";

// Deterministic noise around 0 with σ ≈ 1.
const noise = (n: number, seed = 1) => {
  let s = seed;
  return Array.from({ length: n }, () => {
    s = (s * 16807) % 2147483647;
    const u = s / 2147483647;
    s = (s * 16807) % 2147483647;
    const v = s / 2147483647;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  });
};

describe("spc", () => {
  it("computes mean and sample standard deviation", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(stdev([5])).toBe(0);
  });

  it("computes two- and one-sided Cpk", () => {
    const xs = [9.9, 10, 10.1, 10, 9.9, 10.1];
    const s = stdev(xs);
    expect(cpk(xs, 9, 11)).toBeCloseTo(1 / (3 * s), 6);
    expect(cpk(xs, null, 11)).toBeCloseTo(1 / (3 * s), 6);
    expect(cpk(xs, null, null)).toBeNull();
    // Off-center: the near limit decides.
    expect(cpk(xs, 9.5, 11)).toBeCloseTo(0.5 / (3 * s), 6);
  });

  it("puts control limits at ±3σ", () => {
    expect(controlLimits(20, 0.5)).toEqual({ center: 20, ucl: 21.5, lcl: 18.5 });
  });

  it("doesn't flag a stable process or a single outlier", () => {
    const stable = noise(200).map((z) => 20 + 0.35 * z);
    expect(detectDrift(stable, 20, 0.35).drifting).toBe(false);
    const spike = [...stable.slice(0, 150), 23, ...stable.slice(150)];
    expect(detectDrift(spike, 20, 0.35).drifting).toBe(false);
  });

  it("flags a sustained 1.5σ shift and finds where it started", () => {
    const base = noise(150, 7).map((z) => 20 + 0.35 * z);
    const shifted = noise(40, 9).map((z) => 20.525 + 0.35 * z);
    const r = detectDrift([...base, ...shifted], 20, 0.35);
    expect(r.drifting).toBe(true);
    expect(r.sigmaShift).toBeGreaterThan(1);
    expect(r.startIndex).not.toBeNull();
    expect(r.startIndex!).toBeGreaterThan(120);
    expect(r.startIndex!).toBeLessThanOrEqual(160);
  });

  it("flags a gradual ramp (fixture wear)", () => {
    const ramp = noise(200, 3).map((z, i) => 20 + 0.35 * z + (i > 120 ? (i - 120) * 0.02 : 0));
    expect(detectDrift(ramp, 20, 0.35).drifting).toBe(true);
  });

  it("does nothing without a usable baseline", () => {
    expect(detectDrift([1, 2, 3], 2, 0).drifting).toBe(false);
  });

  it("rates severity by distance to the limit", () => {
    expect(driftSeverity(2.5, 22.1, 18, 22, 0.35)).toBe("critical");
    expect(driftSeverity(1.2, 21.5, 18, 22, 0.35)).toBe("high");
    expect(driftSeverity(1.2, 20.4, 18, 22, 0.35)).toBe("medium");
    expect(driftSeverity(0.5, 20.2, 18, 22, 0.35)).toBe("low");
  });

  it("bins a histogram over the data's range", () => {
    const h = histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(h).toHaveLength(5);
    expect(h.reduce((s, b) => s + b.count, 0)).toBe(11);
    expect(h[4].count).toBe(3);
  });
});
