import { describe, expect, it } from "vitest";

import { formatPValue, FOUR_FIFTHS, MIN_CELL_TO_SHOW, MIN_GROUP_FOR_FLAG, newFlagKeys, overrideGap, requirementGap, stageReport, twoProportionP, type FairnessPerson } from "@/lib/fairness/impact";

function people(group: string, count: number, passed: number, stage: "aiShortlist" | "advanced" = "aiShortlist"): FairnessPerson[] {
  return Array.from({ length: count }, (_, index) => ({
    jobId: 1,
    group,
    applied: true,
    aiShortlist: index < passed,
    advanced: stage === "advanced" ? index < passed : false,
    interviewed: false,
    offer: false,
    rediscoveryInvite: false,
    aiGrade: null,
    humanOverride: false,
    requirements: [],
  }));
}

describe("adverse impact math", () => {
  it("flags a ratio under four-fifths only when both groups have 30 people", () => {
    const report = stageReport([...people("women", 40, 16), ...people("men", 40, 32)], "aiShortlist");
    expect(report.impactRatio).toBeCloseTo(0.5);
    expect(report.impactRatio).toBeLessThan(FOUR_FIFTHS);
    expect(report.flagged).toBe(true);
    expect(report.pValue).not.toBeNull();
    expect(report.pValue ?? 1).toBeLessThan(0.05);
    const small = stageReport([...people("women", 20, 4), ...people("men", 40, 32)], "aiShortlist");
    expect(small.flagged).toBe(false);
    expect(MIN_GROUP_FOR_FLAG).toBe(30);
  });

  it("hides cells with fewer than 10 people", () => {
    const report = stageReport([...people("women", 8, 4), ...people("men", 40, 20)], "aiShortlist");
    expect(report.groups.find((group) => group.group === "women")?.hidden).toBe(true);
    expect(report.groups.find((group) => group.group === "men")?.hidden).toBe(false);
    expect(MIN_CELL_TO_SHOW).toBe(10);
  });

  it("names the requirement with the widest gap", () => {
    const rows: FairnessPerson[] = [];
    for (let index = 0; index < 40; index += 1) {
      rows.push({
        jobId: 1,
        group: "under_25",
        applied: true,
        aiShortlist: false,
        advanced: false,
        interviewed: false,
        offer: false,
        rediscoveryInvite: false,
        aiGrade: 3,
        humanOverride: index < 20,
        requirements: [{ key: "years:5-9", passed: false }, { key: "skill:go", passed: true }],
      });
      rows.push({
        jobId: 1,
        group: "35_44",
        applied: true,
        aiShortlist: false,
        advanced: false,
        interviewed: false,
        offer: false,
        rediscoveryInvite: false,
        aiGrade: 3,
        humanOverride: false,
        requirements: [{ key: "years:5-9", passed: true }, { key: "skill:go", passed: true }],
      });
    }
    expect(requirementGap(rows)?.key).toBe("years:5-9");
    expect(overrideGap(rows).flagged).toBe(true);
  });

  it("treats a brand-new flag as an alert", () => {
    expect(formatPValue(0.0004)).toBe("< 0.001");
    expect(formatPValue(0.042)).toBe("0.042");
    expect(newFlagKeys(["job:1:gender:aiShortlist"], ["job:1:gender:aiShortlist", "job:1:age:offer"])).toEqual(["job:1:age:offer"]);
    expect(twoProportionP({ passedA: 10, sizeA: 10, passedB: 10, sizeB: 10 })).toBe(1);
  });
});
