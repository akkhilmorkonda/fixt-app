import { describe, expect, it } from "vitest";
import { analyzeTest, andersonDarling, anova, capability, controlSignals, fSurvival, groupStats, isStable, limitImpact, normalCdf, quantile, sigmaWithin, suggestLimits } from "@/lib/fixt/capability";

// Deterministic noise around 0 with σ ≈ 1 (mulberry32, as in the demo data). A
// plain LCG pairs badly with Box-Muller and puts too much in the tails.
const noise = (n: number, seed = 1) => {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: n }, () => Math.sqrt(-2 * Math.log(Math.max(next(), 1e-9))) * Math.cos(2 * Math.PI * next()));
};

describe("distributions", () => {
  it("matches normal tail probabilities", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(-3)).toBeCloseTo(0.0013499, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    // 6σ: about 0.001 ppm one-sided, which the ppm estimate relies on.
    expect((1 - normalCdf(6)) * 1e6).toBeCloseTo(0.000987, 5);
  });

  it("matches F-distribution p-values", () => {
    expect(fSurvival(3, 2, 10)).toBeCloseTo(0.0954, 3);
    expect(fSurvival(4.965, 1, 10)).toBeCloseTo(0.05, 3);
    expect(fSurvival(0, 3, 20)).toBe(1);
  });

  it("interpolates quantiles", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
  });
});

describe("capability", () => {
  const xs = noise(2000, 7).map((z) => 10 + z);

  it("computes Cp/Cpk/Pp/Ppk and expected ppm", () => {
    const c = capability(xs, { lsl: 7, usl: 13 });
    expect(c.pp).toBeCloseTo(6 / (6 * c.sd), 9);
    expect(c.ppk).toBeCloseTo(Math.min(13 - c.mean, c.mean - 7) / (3 * c.sd), 9);
    // Sampling noise aside, ±3σ limits are a capability of 1.
    for (const v of [c.pp!, c.ppk!, c.cpk!]) expect(Math.abs(v - 1)).toBeLessThan(0.1);
    expect(c.ppm.total).toBeGreaterThan(1500);
    expect(c.ppm.total).toBeLessThan(4500);
    expect(c.normality.normal).toBe(true);
  });

  it("is one-sided with one limit", () => {
    const c = capability(xs, { lsl: null, usl: 13 });
    expect(c.cp).toBeNull();
    expect(c.ppk).toBeCloseTo((13 - c.mean) / (3 * c.sd), 6);
    expect(c.ppm.below).toBe(0);
  });

  it("separates short-term from long-term spread", () => {
    const ramp = Array.from({ length: 100 }, (_, i) => i * 0.1);
    expect(sigmaWithin(ramp)).toBeLessThan(0.1);
    expect(capability(ramp, { lsl: 0, usl: 10 }).sd).toBeGreaterThan(2);
  });

  it("flags data that isn't normal", () => {
    expect(andersonDarling(noise(300, 3)).p).toBeGreaterThan(0.05);
    const bimodal = noise(300, 3).map((z, i) => z + (i % 2 ? 4 : 0));
    expect(andersonDarling(bimodal).p).toBeLessThan(0.05);
  });
});

describe("control rules", () => {
  it("rarely signals on a stable process", () => {
    for (const seed of [1, 2, 3, 4, 5, 11, 42]) {
      const s = controlSignals(noise(168, seed), 0, 1);
      expect(isStable(s, 168)).toBe(true);
    }
  });

  it("catches a shift, a trend and an outlier", () => {
    const shifted = [...noise(60, 2), ...noise(60, 9).map((z) => z + 1.5)];
    const s = controlSignals(shifted, 0, 1);
    expect(s.some((x) => x.rule === "run_of_eight" && x.index >= 60)).toBe(true);
    expect(isStable(s, shifted.length)).toBe(false);

    expect(controlSignals([0, 0.1, 0.2, 0.3, 0.4, 0.5], 0, 1).some((x) => x.rule === "trend_of_six")).toBe(true);
    expect(controlSignals([0, 0, 5, 0], 0, 1)).toEqual([{ rule: "beyond_3s", index: 2 }]);
  });
});

describe("comparing groups", () => {
  it("finds a real difference between groups and not a fake one", () => {
    const a = noise(50, 1);
    const b = noise(50, 2);
    expect(anova([a, b])!.p).toBeGreaterThan(0.05);
    expect(anova([a, b.map((x) => x + 1.5)])!.p).toBeLessThan(0.001);
    expect(anova([a])).toBeNull();
  });

  it("summarizes by group, largest first", () => {
    const items = [...noise(30, 1).map((v) => ({ v, lot: "A" })), ...noise(10, 2).map((v) => ({ v: v + 5, lot: "B" })), { v: 1, lot: null }];
    const g = groupStats(items, (x) => x.lot, (x) => x.v);
    expect(g.groups.map((x) => x.label)).toEqual(["A", "B"]);
    expect(g.groups[1].mean).toBeGreaterThan(4);
    expect(g.anova!.p).toBeLessThan(0.001);
  });
});

describe("limit tuning", () => {
  const xs = noise(500, 5).map((z) => 20 + z * 0.5);

  it("suggests limits that land at the target Ppk and keeps one-sided tests one-sided", () => {
    const s = suggestLimits(xs, { lsl: 19, usl: 21 }, "cpk", 1.33);
    expect(capability(xs, s).ppk!).toBeCloseTo(1.33, 1);
    const one = suggestLimits(xs, { lsl: null, usl: 21 }, "cpk", 1.33);
    expect(one.lsl).toBeNull();
    expect(one.usl).toBeGreaterThan(21);
    const p = suggestLimits(xs, { lsl: 19, usl: 21 }, "percentile", 0.01);
    expect(xs.filter((x) => x < p.lsl! || x > p.usl!).length).toBeLessThanOrEqual(12);
  });

  it("replays history against new limits", () => {
    const i = limitImpact([1, 2, 3, 4, 5], { lsl: 2, usl: 4 }, { lsl: 1, usl: 3 });
    expect(i.current.fails).toBe(2);
    expect(i.proposed.fails).toBe(2);
    expect(i.newlyFailing).toBe(1);
    expect(i.newlyPassing).toBe(1);
    expect(i.proposed.yield).toBeCloseTo(0.6, 6);
  });

  it("calls each case the way an engineer would", () => {
    const sd = 0.5;
    const verdict = (lsl: number | null, usl: number | null, data = xs) => analyzeTest(data, { lsl, usl }).assessment.verdict;
    expect(verdict(20 - 2 * sd, 20 + 2 * sd)).toBe("too_tight");
    expect(verdict(20 - 5 * sd, 20 + 5 * sd)).toBe("capable");
    expect(verdict(20 - 12 * sd, 20 + 12 * sd)).toBe("loose");
    expect(verdict(20 - 3.5 * sd, 20 + 3.5 * sd)).toBe("marginal");
    expect(verdict(20 - 2 * sd, 20 + 8 * sd)).toBe("off_center");
    expect(verdict(null, null)).toBe("no_limits");
    // A good process plus a cluster of bad readings (settling, contact) is the test, not the limits.
    const flaky = xs.map((x, i) => (i % 9 === 0 ? 22.5 + (i % 4) * 0.5 : x));
    expect(verdict(null, 21.6, flaky)).toBe("test_issue");
    expect(verdict(19, 21, xs.slice(0, 10))).toBe("insufficient");
    const drifting = xs.map((x, i) => x + (i > 250 ? (i - 250) * 0.01 : 0));
    expect(verdict(10, 30, drifting)).toBe("unstable");
    expect(analyzeTest(xs, { lsl: 19, usl: 21 }).assessment.suggestion).not.toBeNull();
  });
});
