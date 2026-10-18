import { describe, expect, it } from "vitest";

import {
  auditReason,
  bulkRejectPlan,
  displayScore,
  filterReviewRows,
  moveSelection,
  reviewKey,
  sortByScore,
  type ReviewRow,
} from "@/lib/review/review-queue";

function row(partial: Partial<ReviewRow> & Pick<ReviewRow, "id">): ReviewRow {
  return {
    name: "Candidate",
    title: "Engineer",
    company: "Nimbus",
    status: "CV_POOL",
    score: 0.5,
    analysed: true,
    optedOut: false,
    humanReview: false,
    quotes: [],
    knockout: "pass",
    parseStatus: null,
    ...partial,
  };
}

describe("review queue rules", () => {
  it("moves with J and K and maps the action keys", () => {
    expect(reviewKey("j")).toBe("next");
    expect(reviewKey("k")).toBe("previous");
    expect(reviewKey("A")).toBe("advance");
    expect(reviewKey("s")).toBe("shortlist");
    expect(reviewKey("r")).toBe("reject");
    expect(reviewKey("o")).toBe("open");
    expect(reviewKey("u")).toBe("undo");
    expect(reviewKey("?")).toBe("help");
    expect(moveSelection(0, 3, "next")).toBe(1);
    expect(moveSelection(0, 3, "previous")).toBe(0);
  });

  it("requires a reason from the fixed list before a reject is valid", () => {
    expect(auditReason("Missing required skill", 0.42, false)).toContain("Missing required skill");
    expect(auditReason("Missing required skill", 0.42, false)).toContain("aiScore=0.42");
  });

  it("blocks bulk reject for candidates who asked for human review", () => {
    const rows = [row({ id: 1, humanReview: true }), row({ id: 2 })];
    expect(bulkRejectPlan(rows, [1, 2])).toEqual({ allowed: [2], blocked: [1] });
  });

  it("puts a strong match first and leaves zero or missing scores at the bottom", () => {
    const ordered = sortByScore([
      row({ id: 1, score: 0 }),
      row({ id: 2, score: null }),
      row({ id: 3, score: 0.8 }),
      row({ id: 4, optedOut: true, score: 0.9 }),
    ]);
    expect(ordered.map((item) => item.id)).toEqual([3, 1, 2, 4]);
  });

  it("hides the score when the candidate opted out of AI", () => {
    expect(displayScore(row({ id: 1, optedOut: true, score: 0.9 }))).toBeNull();
    expect(auditReason(null, 0.9, true)).toBe("aiScore=manual");
  });

  it("filters by stage, score, knockout, parse status, and human review", () => {
    const rows = [
      row({ id: 1, status: "CV_POOL", score: 0.2, knockout: "fail", parseStatus: "LOW_QUALITY" }),
      row({ id: 2, status: "SHORTLISTED", score: 0.9, humanReview: true }),
    ];
    expect(filterReviewRows(rows, { stage: "SHORTLISTED", minScore: "", maxScore: "", knockout: "", parse: "", human: "" }).map((item) => item.id)).toEqual([2]);
    expect(filterReviewRows(rows, { stage: "", minScore: "0.5", maxScore: "", knockout: "", parse: "", human: "" }).map((item) => item.id)).toEqual([2]);
    expect(filterReviewRows(rows, { stage: "", minScore: "", maxScore: "", knockout: "fail", parse: "", human: "" }).map((item) => item.id)).toEqual([1]);
    expect(filterReviewRows(rows, { stage: "", minScore: "", maxScore: "", knockout: "", parse: "LOW_QUALITY", human: "" }).map((item) => item.id)).toEqual([1]);
    expect(filterReviewRows(rows, { stage: "", minScore: "", maxScore: "", knockout: "", parse: "", human: "yes" }).map((item) => item.id)).toEqual([2]);
  });
});
