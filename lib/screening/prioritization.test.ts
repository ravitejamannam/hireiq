import { describe, expect, it } from "vitest";

import {
  bankBasicResult,
  chooseBasicResult,
  generatedBasicResult,
  generatedVersionKey,
} from "@/lib/screening/basic-result";
import {
  acceptAiCriterionSuggestion,
  finalPracticalScore,
  parsePracticalSubmission,
  practicalAcceptsSubmission,
  practicalStateOf,
} from "@/lib/screening/practical";
import {
  prioritizeCandidates,
  referenceKey,
  type CandidateInput,
} from "@/lib/screening/prioritization";
import {
  DEFAULT_SCREENING_POLICY,
  parseScreeningPolicyInput,
  type ScreeningPolicy,
} from "@/lib/screening/screening-policy";

const BANK = "bank:ENGINEERING";
const RUBRIC = "rubric:00000001";

const policy: ScreeningPolicy = {
  ...DEFAULT_SCREENING_POLICY,
  id: 1,
  version: 1,
  basicPassPercent: 60,
  practicalPassPercent: 60,
  reviewCapacity: 2,
};

function candidate(id: number, overrides: Partial<CandidateInput> = {}): CandidateInput {
  return {
    applicationId: id,
    closed: false,
    humanReviewRequested: false,
    parseIssue: false,
    basic: { state: "COMPLETED", percent: 80, versionKey: BANK },
    practical: { state: "GRADED", percent: 80, versionKey: RUBRIC },
    evidence: { state: "ANALYSED", supported: 4, total: 5, source: "APPROVED_REQUIREMENTS" },
    eligibility: { knockoutFailed: false, requiredNotMet: 0, requiredUnknown: 0 },
    ...overrides,
  };
}

function evaluate(inputs: CandidateInput[], config: ScreeningPolicy = policy) {
  const result = prioritizeCandidates(inputs, config);
  const byId = new Map(result.evaluations.map((row) => [row.applicationId, row]));
  return { ...result, byId };
}

describe("prioritization engine", () => {
  it("A: a passing basic assessment counts and points to the practical", () => {
    const { byId } = evaluate([candidate(1, { practical: { state: "NOT_ASSIGNED" } })]);
    const row = byId.get(1)!;
    expect(row.components.basic.percent).toBe(80);
    expect(row.combined).toBeNull();
    expect(row.missing).toEqual(["practical"]);
    expect(row.views).toContain("practical");
    expect(row.nextAction).toBe("Assign the practical assessment.");
  });

  it("B: below the basic threshold is BELOW, stays visible, and is never auto-rejected", () => {
    const { byId } = evaluate([candidate(1, { basic: { state: "COMPLETED", percent: 40, versionKey: BANK }, practical: { state: "NOT_ASSIGNED" } })]);
    const row = byId.get(1)!;
    expect(row.standard).toBe("BELOW");
    expect(row.combined).toBeNull();
    expect(row.category).toBe("WEAK_EVIDENCE");
    expect(row.views).toEqual(["all", "weak"]);
    expect(row.priority).toBe(false);
    expect(row.nextAction).toMatch(/record a decision/);
  });

  it("C: strong basic but weak practical is below the standard and flags the disagreement", () => {
    const { byId } = evaluate([candidate(1, { basic: { state: "COMPLETED", percent: 95, versionKey: BANK }, practical: { state: "GRADED", percent: 35, versionKey: RUBRIC } })]);
    const row = byId.get(1)!;
    expect(row.standard).toBe("BELOW");
    expect(row.combined).toBeCloseTo(95 * 0.3 + 35 * 0.5 + 80 * 0.2, 1);
    expect(row.category).toBe("WEAK_EVIDENCE");
    expect(row.flags.map((flag) => flag.code)).toContain("COMPONENT_DISAGREEMENT");
    expect(row.priority).toBe(false);
  });

  it("D: strong on both meets the standard and is prioritised", () => {
    const { byId } = evaluate([candidate(1, { basic: { state: "COMPLETED", percent: 90, versionKey: BANK }, practical: { state: "GRADED", percent: 92, versionKey: RUBRIC } })]);
    const row = byId.get(1)!;
    expect(row.standard).toBe("MEETS");
    expect(row.priority).toBe(true);
    expect(row.rank).toBe(1);
    expect(row.category).toBe("TOP");
    expect(row.views).toEqual(expect.arrayContaining(["top"]));
  });

  it("E: strong practical with sparse resume evidence still meets the standard and is flagged for review", () => {
    const { byId } = evaluate([candidate(1, { practical: { state: "GRADED", percent: 90, versionKey: RUBRIC }, evidence: { state: "ANALYSED", supported: 1, total: 5, source: "APPROVED_REQUIREMENTS" } })]);
    const row = byId.get(1)!;
    expect(row.standard).toBe("MEETS");
    expect(row.flags.map((flag) => flag.code)).toContain("STRONG_PRACTICAL_SPARSE_EVIDENCE");
    expect(row.category).toBe("TOP");
  });

  it("F and O: a missing assessment is incomplete, not zero, and gets no combined score", () => {
    const { byId } = evaluate([candidate(1, { basic: { state: "INVITED", deadline: new Date("2030-01-01") }, practical: { state: "NOT_ASSIGNED" } })]);
    const row = byId.get(1)!;
    expect(row.components.basic.percent).toBeNull();
    expect(row.combined).toBeNull();
    expect(row.rank).toBeNull();
    expect(row.standard).toBe("INCOMPLETE");
    expect(row.views).toContain("assessment");
    expect(row.views).not.toContain("practical");
  });

  it("G: work waiting on grading is pending, never scored", () => {
    const { byId } = evaluate([candidate(1, { basic: { state: "PENDING_GRADING", versionKey: BANK } })]);
    const row = byId.get(1)!;
    expect(row.combined).toBeNull();
    expect(row.nextAction).toBe("Grade the written answers.");
    expect(row.flags.map((flag) => flag.code)).toContain("PENDING_HUMAN_GRADING");
  });

  it("J: results on a different rubric version are not ranked against the pool", () => {
    const { byId, summary } = evaluate([
      candidate(1),
      candidate(2),
      candidate(3, { practical: { state: "GRADED", percent: 99, versionKey: "rubric:00000002" } }),
    ]);
    expect(summary.reference.practical).toBe(RUBRIC);
    const row = byId.get(3)!;
    expect(row.components.practical.comparable).toBe(false);
    expect(row.combined).toBeNull();
    expect(row.rank).toBeNull();
    expect(row.flags.map((flag) => flag.code)).toContain("PRACTICAL_INCOMPARABLE");
  });

  it("P: fewer qualified candidates than capacity is reported, not padded", () => {
    const { summary, evaluations } = evaluate(
      [candidate(1), candidate(2, { basic: { state: "COMPLETED", percent: 30, versionKey: BANK } })],
      { ...policy, reviewCapacity: 10 },
    );
    expect(summary.priorityCount).toBe(1);
    expect(summary.capacityNote).toMatch(/1 candidate\(s\) meet the standard/);
    expect(evaluations.find((row) => row.applicationId === 2)!.priority).toBe(false);
  });

  it("Q: many qualified candidates fill capacity; the rest are Possible fit", () => {
    const pool = [1, 2, 3, 4].map((id) => candidate(id, { practical: { state: "GRADED", percent: 60 + id * 8, versionKey: RUBRIC } }));
    const { summary, byId } = evaluate(pool);
    expect(summary.priorityCount).toBe(2);
    expect(byId.get(4)!.priority).toBe(true);
    expect(byId.get(3)!.priority).toBe(true);
    expect(byId.get(1)!.priority).toBe(false);
    expect(byId.get(1)!.category).toBe("POSSIBLE_FIT");
    expect(byId.get(1)!.views).toContain("possible");
    expect(byId.get(1)!.nextAction).toMatch(/Outside the current review capacity/);
    expect(summary.capacityNote).toMatch(/shows the first 2\. The rest still meet the standard/);
  });

  it("is deterministic regardless of input order, and ties break by application id", () => {
    const pool = [candidate(7), candidate(3), candidate(5)];
    const first = evaluate(pool).evaluations.map((row) => [row.applicationId, row.rank] as const);
    const second = evaluate([...pool].reverse()).evaluations.map((row) => [row.applicationId, row.rank] as const);
    expect(new Map(first)).toEqual(new Map(second));
    expect(new Map(first).get(3)).toBe(1);
    expect(evaluate(pool).byId.get(3)!.flags.map((flag) => flag.code)).toContain("CLOSE_TO_NEIGHBOUR");
  });

  it("closed applications are listed under All but never prioritised", () => {
    const { byId } = evaluate([candidate(1, { closed: true })]);
    expect(byId.get(1)!.views).toEqual(["all"]);
    expect(byId.get(1)!.rank).toBeNull();
  });

  it("unknown eligibility is not a failure; a reviewer's NOT_MET is", () => {
    const { byId } = evaluate([
      candidate(1, { eligibility: { knockoutFailed: false, requiredNotMet: 0, requiredUnknown: 2 } }),
      candidate(2, { eligibility: { knockoutFailed: false, requiredNotMet: 1, requiredUnknown: 0 } }),
    ]);
    expect(byId.get(1)!.eligibility).toBe("UNVERIFIED");
    expect(byId.get(1)!.priority).toBe(true);
    expect(byId.get(2)!.eligibility).toBe("NOT_MET");
    expect(byId.get(2)!.priority).toBe(false);
    expect(byId.get(2)!.category).toBe("NOT_MET");
    expect(byId.get(2)!.views).toContain("not_met");
  });

  it("without thresholds, priority is labelled relative only", () => {
    const { summary, byId } = evaluate([candidate(1)], { ...policy, basicPassPercent: null, practicalPassPercent: null });
    expect(byId.get(1)!.standard).toBe("NO_THRESHOLD");
    expect(byId.get(1)!.priority).toBe(true);
    expect(summary.capacityNote).toMatch(/does not show that anyone meets/);
  });

  it("a borderline result is a Possible fit, not Top", () => {
    const { byId } = evaluate([candidate(1, { practical: { state: "GRADED", percent: 57, versionKey: RUBRIC } })]);
    expect(byId.get(1)!.standard).toBe("BORDERLINE");
    expect(byId.get(1)!.category).toBe("POSSIBLE_FIT");
    expect(byId.get(1)!.priority).toBe(false);
  });

  it("a zero-weight component does not block the combined score", () => {
    const { byId } = evaluate([candidate(1, { evidence: { state: "NOT_ANALYSED" } })], { ...policy, basicWeight: 30, practicalWeight: 70, evidenceWeight: 0 });
    expect(byId.get(1)!.combined).toBe(80);
  });

  it("picks the most common version as the reference, ties to the greater key", () => {
    expect(referenceKey(["a", "b", "b"])).toBe("b");
    expect(referenceKey(["a", "b"])).toBe("b");
    expect(referenceKey([])).toBeNull();
  });
});

describe("categories and Top 20", () => {
  it("defaults to 30/50/20 weights and a Top 20 review capacity", () => {
    expect([DEFAULT_SCREENING_POLICY.basicWeight, DEFAULT_SCREENING_POLICY.practicalWeight, DEFAULT_SCREENING_POLICY.evidenceWeight]).toEqual([30, 50, 20]);
    expect(DEFAULT_SCREENING_POLICY.reviewCapacity).toBe(20);
  });

  it("puts every applicant in exactly one category and the counts add up", () => {
    const pool: CandidateInput[] = [
      ...Array.from({ length: 25 }, (_, index) => candidate(index + 1, { practical: { state: "GRADED", percent: 70 + (index % 25), versionKey: RUBRIC } })),
      candidate(100, { basic: { state: "COMPLETED", percent: 57, versionKey: BANK } }),
      candidate(101, { basic: { state: "COMPLETED", percent: 20, versionKey: BANK } }),
      candidate(102, { eligibility: { knockoutFailed: true, requiredNotMet: 0, requiredUnknown: 0 } }),
      candidate(103, { practical: { state: "GRADED", percent: 90, versionKey: "rubric:other" } }),
      candidate(104, { humanReviewRequested: true }),
      candidate(105, { basic: { state: "INVITED", deadline: new Date("2030-01-01") }, practical: { state: "NOT_ASSIGNED" } }),
      candidate(106, { closed: true }),
    ];
    const { summary, byId } = evaluate(pool, { ...policy, reviewCapacity: 20 });
    expect(summary.categoryCounts).toEqual({
      TOP: 20,
      POSSIBLE_FIT: 6,
      WEAK_EVIDENCE: 1,
      NOT_MET: 1,
      NEEDS_INFO: 2,
      IN_PROGRESS: 1,
      CLOSED: 1,
    });
    expect(Object.values(summary.categoryCounts).reduce((sum, count) => sum + count, 0)).toBe(pool.length);
    expect(summary.viewCounts.top).toBe(20);
    expect(summary.viewCounts.all).toBe(pool.length);
    expect(byId.get(100)!.category).toBe("POSSIBLE_FIT");
    expect(byId.get(101)!.category).toBe("WEAK_EVIDENCE");
    expect(byId.get(102)!.category).toBe("NOT_MET");
    expect(byId.get(103)!.category).toBe("NEEDS_INFO");
    expect(byId.get(104)!.category).toBe("NEEDS_INFO");
    expect(byId.get(105)!.category).toBe("IN_PROGRESS");
    expect(byId.get(105)!.combined).toBeNull();
  });

  it("a failed must-have is shown for review but never closed or ranked into Top", () => {
    const { byId } = evaluate([candidate(1, { eligibility: { knockoutFailed: true, requiredNotMet: 0, requiredUnknown: 0 } })]);
    const row = byId.get(1)!;
    expect(row.category).toBe("NOT_MET");
    expect(row.priority).toBe(false);
    expect(row.nextAction).toMatch(/Verify the essential requirement/);
  });

  it("without thresholds, a weak combined score is Weak evidence rather than Top", () => {
    const { byId } = evaluate(
      [candidate(1), candidate(2, { basic: { state: "COMPLETED", percent: 20, versionKey: BANK }, practical: { state: "GRADED", percent: 30, versionKey: RUBRIC }, evidence: { state: "ANALYSED", supported: 1, total: 5, source: "APPROVED_REQUIREMENTS" } })],
      { ...policy, basicPassPercent: null, practicalPassPercent: null },
    );
    expect(byId.get(1)!.category).toBe("TOP");
    expect(byId.get(2)!.category).toBe("WEAK_EVIDENCE");
  });
});

describe("screening policy validation (J)", () => {
  const valid = {
    basicWeight: 30,
    practicalWeight: 50,
    evidenceWeight: 20,
    basicPassPercent: 60,
    practicalPassPercent: null,
    borderlineBandPercent: 5,
    reviewCapacity: 20,
    practicalTitle: "Fix the API",
    practicalInstructions: null,
    practicalEstimatedMinutes: 90,
    practicalAllowedResources: null,
    practicalDeadlineDays: 5,
    practicalCompensationNote: null,
    practicalRubric: DEFAULT_SCREENING_POLICY.practicalRubric,
  };

  it("accepts weights that add to 100", () => {
    expect(parseScreeningPolicyInput(valid).success).toBe(true);
  });

  it("rejects weights that do not add to 100, out-of-range values, and unknown fields", () => {
    expect(parseScreeningPolicyInput({ ...valid, evidenceWeight: 30 }).success).toBe(false);
    expect(parseScreeningPolicyInput({ ...valid, basicWeight: -5, practicalWeight: 85 }).success).toBe(false);
    expect(parseScreeningPolicyInput({ ...valid, basicPassPercent: 101 }).success).toBe(false);
    expect(parseScreeningPolicyInput({ ...valid, basicWeight: "25" }).success).toBe(false);
    expect(parseScreeningPolicyInput({ ...valid, score: 100 }).success).toBe(false);
  });

  it("rejects a practical weight with no rubric and repeated criterion keys", () => {
    expect(parseScreeningPolicyInput({ ...valid, practicalRubric: [] }).success).toBe(false);
    const repeated = [DEFAULT_SCREENING_POLICY.practicalRubric[0], DEFAULT_SCREENING_POLICY.practicalRubric[0]];
    expect(parseScreeningPolicyInput({ ...valid, practicalRubric: repeated }).success).toBe(false);
  });
});

describe("basic assessment results", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  const types = new Map([
    ["mc", "multiple_choice"],
    ["written", "short_answer"],
  ]);

  it("scores a graded generated assessment as a percent of available points", () => {
    const result = generatedBasicResult(
      { assessmentId: 3, startedAt: now, submittedAt: now, gradedAt: now, expiresAt: now, grades: [{ itemId: "mc", score: 1, needsHuman: false }, { itemId: "written", score: 3, needsHuman: false }] },
      types,
      now,
    );
    expect(result).toEqual({ state: "COMPLETED", percent: (4 / 6) * 100, versionKey: generatedVersionKey(3) });
  });

  it("G: submitted but grading never finished stays pending", () => {
    const result = generatedBasicResult({ assessmentId: 3, startedAt: now, submittedAt: now, gradedAt: null, expiresAt: now, grades: null }, types, now);
    expect(result.state).toBe("PENDING_GRADING");
  });

  it("N: an item the model could not grade stays pending instead of being scored", () => {
    const result = generatedBasicResult(
      { assessmentId: 3, startedAt: now, submittedAt: now, gradedAt: now, expiresAt: now, grades: [{ itemId: "written", score: null, needsHuman: true }] },
      types,
      now,
    );
    expect(result.state).toBe("PENDING_GRADING");
  });

  it("an unsubmitted invite past its deadline is expired", () => {
    const result = generatedBasicResult({ assessmentId: 3, startedAt: null, submittedAt: null, gradedAt: null, expiresAt: new Date(now.getTime() - 1), grades: null }, types, now);
    expect(result.state).toBe("EXPIRED");
  });

  it("maps bank attempts and prefers finished work", () => {
    const bank = bankBasicResult({ roleCategory: "SALES", expiresAt: now, startedAt: now, revokedAt: null, attempt: { status: "COMPLETED", score: 6, maxScore: 8 } }, now);
    expect(bank).toEqual({ state: "COMPLETED", percent: 75, versionKey: "bank:SALES" });
    expect(chooseBasicResult({ state: "INVITED", deadline: now }, bank)).toBe(bank);
    expect(chooseBasicResult(null, null)).toEqual({ state: "NOT_INVITED" });
  });
});

describe("practical grading", () => {
  const rubric = [
    { key: "a", label: "A", description: "", maxPoints: 5 },
    { key: "b", label: "B", description: "", maxPoints: 5 },
  ];
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 19, 0, minutes));

  it("needs a human score on every criterion; AI suggestions never count", () => {
    expect(finalPracticalScore(rubric, [
      { id: 1, criterionKey: "a", points: 5, maxPoints: 5, source: "HUMAN", createdAt: at(1) },
      { id: 2, criterionKey: "b", points: 5, maxPoints: 5, source: "AI_SUGGESTED", createdAt: at(2) },
    ])).toBeNull();
  });

  it("K: a later human correction replaces the earlier score", () => {
    const score = finalPracticalScore(rubric, [
      { id: 1, criterionKey: "a", points: 5, maxPoints: 5, source: "HUMAN", createdAt: at(1) },
      { id: 2, criterionKey: "b", points: 4, maxPoints: 5, source: "HUMAN", createdAt: at(2) },
      { id: 3, criterionKey: "a", points: 2, maxPoints: 5, source: "HUMAN", createdAt: at(3) },
    ]);
    expect(score).toEqual({ points: 6, maxPoints: 10, percent: 60 });
  });

  it("J: a score recorded against a different max for the criterion is not reused", () => {
    expect(finalPracticalScore(rubric, [
      { id: 1, criterionKey: "a", points: 3, maxPoints: 3, source: "HUMAN", createdAt: at(1) },
      { id: 2, criterionKey: "b", points: 4, maxPoints: 5, source: "HUMAN", createdAt: at(2) },
    ])).toBeNull();
  });

  it("H: a second submission or a late one is refused", () => {
    const now = at(10);
    expect(practicalAcceptsSubmission({ submittedAt: at(5), dueAt: null, now })).toBe(false);
    expect(practicalAcceptsSubmission({ submittedAt: null, dueAt: at(9), now })).toBe(false);
    expect(practicalAcceptsSubmission({ submittedAt: null, dueAt: at(11), now })).toBe(true);
  });

  it("derives the practical state", () => {
    const now = at(10);
    expect(practicalStateOf({ submittedAt: null, gradedAt: null, dueAt: at(5), now })).toBe("OVERDUE");
    expect(practicalStateOf({ submittedAt: at(4), gradedAt: null, dueAt: at(5), now })).toBe("PENDING_GRADING");
    expect(practicalStateOf({ submittedAt: at(4), gradedAt: at(6), dueAt: at(5), now })).toBe("GRADED");
  });

  it("validates submissions server-side", () => {
    expect(parsePracticalSubmission({ text: "too short" }).success).toBe(false);
    expect(parsePracticalSubmission({ text: "x".repeat(30), url: "javascript:alert(1)" }).success).toBe(false);
    expect(parsePracticalSubmission({ text: "x".repeat(30), score: 100 }).success).toBe(false);
    expect(parsePracticalSubmission({ text: "x".repeat(30), url: "https://github.com/a/b" }).success).toBe(true);
  });

  it("N: AI suggestions without a verbatim quote or out of range are dropped", () => {
    const submission = "I added a retry with exponential backoff and a test for the timeout path.";
    const criterion = rubric[0]!;
    expect(acceptAiCriterionSuggestion({ submission, criterion, points: 4, quote: "a test for the timeout path", rationale: "ok" })).not.toBeNull();
    expect(acceptAiCriterionSuggestion({ submission, criterion, points: 4, quote: "invented quote here", rationale: "ok" })).toBeNull();
    expect(acceptAiCriterionSuggestion({ submission, criterion, points: 9, quote: "a test for the timeout path", rationale: "ok" })).toBeNull();
    expect(acceptAiCriterionSuggestion({ submission, criterion, points: "4", quote: "a test for the timeout path", rationale: "ok" })).toBeNull();
  });
});
