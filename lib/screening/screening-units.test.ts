import { mkdirSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  QUESTION_POOL_TARGET,
  attemptDeadline,
  difficultyOf,
  difficultyTargets,
  drawAssessmentItems,
  drawUnusedAssessmentItems,
  generateAssessmentFromRubric,
  questionSetCapacity,
  questionSetKey,
  sanitizeIntegrity,
  validateAnswerPatch,
} from "@/lib/assessments/generated-assessment";
import { bankBasicResult, chooseBasicResult, generatedBasicResult } from "@/lib/screening/basic-result";
import {
  acceptAiCriterionSuggestion,
  finalPracticalScore,
  parsePracticalSubmission,
  practicalAcceptsSubmission,
  practicalStateOf,
  type CriterionScoreRow,
} from "@/lib/screening/practical";
import { prioritizeCandidates, type CandidateInput } from "@/lib/screening/prioritization";
import { queryScreeningPool, rubricVersionKey, type ScreeningPool, type ScreeningRow } from "@/lib/screening/screening-data";
import { buildScreeningFunnel, estimateRecruiterTimeSaved, type ScreeningFunnelSnapshot } from "@/lib/screening/screening-funnel";
import { fourFifths } from "@/lib/screening/screening-fairness";
import { DEFAULT_SCREENING_POLICY, type RubricCriterion } from "@/lib/screening/screening-policy";

const rubric: RubricCriterion[] = [
  { key: "correctness", label: "Correctness", description: "", maxPoints: 5 },
  { key: "reasoning", label: "Reasoning", description: "", maxPoints: 5 },
];

let nextId = 1;
function score(criterionKey: string, points: number, source: "HUMAN" | "AI_SUGGESTED", at: string, maxPoints = 5): CriterionScoreRow {
  return { id: nextId++, criterionKey, points, maxPoints, source, createdAt: new Date(at) };
}

describe("practical scoring", () => {
  it("is not final until every criterion has a human score, and AI suggestions never count", () => {
    const rows = [score("correctness", 4, "HUMAN", "2026-10-19T10:00:00Z"), score("reasoning", 5, "AI_SUGGESTED", "2026-10-19T10:00:00Z")];
    expect(finalPracticalScore(rubric, rows)).toBeNull();
    rows.push(score("reasoning", 3, "HUMAN", "2026-10-19T10:05:00Z"));
    expect(finalPracticalScore(rubric, rows)).toEqual({ points: 7, maxPoints: 10, percent: 70 });
  });

  it("uses the latest human correction and keeps the earlier row as history", () => {
    const rows = [
      score("correctness", 2, "HUMAN", "2026-10-19T10:00:00Z"),
      score("reasoning", 2, "HUMAN", "2026-10-19T10:00:00Z"),
      score("correctness", 5, "HUMAN", "2026-10-19T11:00:00Z"),
    ];
    expect(finalPracticalScore(rubric, rows)?.points).toBe(7);
  });

  it("refuses a score recorded against a different max than the rubric", () => {
    const rows = [score("correctness", 4, "HUMAN", "2026-10-19T10:00:00Z", 10), score("reasoning", 4, "HUMAN", "2026-10-19T10:00:00Z")];
    expect(finalPracticalScore(rubric, rows)).toBeNull();
  });

  it("drops AI suggestions without a verbatim quote or with out-of-range points", () => {
    const submission = "I added an index on orders.created_at and measured the query plan before and after.";
    const criterion = rubric[0]!;
    expect(acceptAiCriterionSuggestion({ submission, criterion, points: 4, quote: "added an index on orders", rationale: "ok" })).toMatchObject({ points: 4 });
    expect(acceptAiCriterionSuggestion({ submission, criterion, points: 4, quote: "wrote unit tests", rationale: "" })).toBeNull();
    expect(acceptAiCriterionSuggestion({ submission, criterion, points: 6, quote: "added an index on orders", rationale: "" })).toBeNull();
    expect(acceptAiCriterionSuggestion({ submission, criterion, points: 2.5, quote: "added an index on orders", rationale: "" })).toBeNull();
    expect(acceptAiCriterionSuggestion({ submission, criterion, points: 3, quote: "index", rationale: "" })).toBeNull();
  });

  it("validates submissions strictly", () => {
    expect(parsePracticalSubmission({ text: "too short" }).success).toBe(false);
    expect(parsePracticalSubmission({ text: "x".repeat(30), url: "http://example.com" }).success).toBe(false);
    expect(parsePracticalSubmission({ text: "x".repeat(30), score: 100 }).success).toBe(false);
    const ok = parsePracticalSubmission({ text: "x".repeat(30), url: "https://github.com/a/b" });
    expect(ok.success && ok.data.url).toBe("https://github.com/a/b");
  });

  it("closes submission at the deadline and after the first submit", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    expect(practicalAcceptsSubmission({ submittedAt: null, dueAt: new Date("2026-10-19T12:00:01Z"), now })).toBe(true);
    expect(practicalAcceptsSubmission({ submittedAt: null, dueAt: now, now })).toBe(false);
    expect(practicalAcceptsSubmission({ submittedAt: now, dueAt: null, now })).toBe(false);
    expect(practicalStateOf({ submittedAt: null, gradedAt: null, dueAt: new Date("2026-10-18T00:00:00Z"), now })).toBe("OVERDUE");
    expect(practicalStateOf({ submittedAt: now, gradedAt: null, dueAt: null, now })).toBe("PENDING_GRADING");
  });

  it("gives a stable rubric version key that changes when the rubric changes", () => {
    expect(rubricVersionKey(rubric)).toBe(rubricVersionKey(JSON.parse(JSON.stringify(rubric))));
    expect(rubricVersionKey(rubric)).not.toBe(rubricVersionKey([{ ...rubric[0]!, maxPoints: 10 }, rubric[1]!]));
  });
});

describe("basic assessment results", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  const types = new Map([
    ["q1", "multiple_choice"],
    ["q2", "short_answer"],
  ]);

  it("is pending while any written answer needs a person, and never fills the gap with zero", () => {
    const result = generatedBasicResult(
      {
        assessmentId: 3,
        startedAt: now,
        submittedAt: now,
        gradedAt: now,
        expiresAt: new Date("2026-10-20T00:00:00Z"),
        grades: [
          { itemId: "q1", score: 1, needsHuman: false },
          { itemId: "q2", score: null, needsHuman: true },
        ],
      },
      types,
      now,
    );
    expect(result).toEqual({ state: "PENDING_GRADING", versionKey: "generated:00000003" });
  });

  it("is pending when grading did not finish", () => {
    const result = generatedBasicResult(
      { assessmentId: 3, startedAt: now, submittedAt: now, gradedAt: null, expiresAt: now, grades: null },
      types,
      now,
    );
    expect(result.state).toBe("PENDING_GRADING");
  });

  it("weights items by their own maximum", () => {
    const result = generatedBasicResult(
      {
        assessmentId: 3,
        startedAt: now,
        submittedAt: now,
        gradedAt: now,
        expiresAt: now,
        grades: [
          { itemId: "q1", score: 1, needsHuman: false },
          { itemId: "q2", score: 2, needsHuman: false },
        ],
      },
      types,
      now,
    );
    expect(result).toEqual({ state: "COMPLETED", percent: 50, versionKey: "generated:00000003" });
  });

  it("reports expiry and prefers a finished result over one in progress", () => {
    const expired = generatedBasicResult(
      { assessmentId: 3, startedAt: null, submittedAt: null, gradedAt: null, expiresAt: new Date("2026-10-18T00:00:00Z"), grades: null },
      types,
      now,
    );
    expect(expired.state).toBe("EXPIRED");
    const bank = bankBasicResult(
      { roleCategory: "ENGINEERING", expiresAt: now, startedAt: now, revokedAt: null, attempt: { status: "COMPLETED", score: 6, maxScore: 8 } },
      now,
    );
    expect(bank).toEqual({ state: "COMPLETED", percent: 75, versionKey: "bank:ENGINEERING" });
    expect(chooseBasicResult(expired, bank)).toBe(bank);
  });
});

describe("generated assessment answers", () => {
  const items = generateAssessmentFromRubric({
    requirements: ["Go", "PostgreSQL", "Kubernetes", "gRPC", "Observability", "On-call"],
    rubric: [{ criterion: "Backend", signal: "Production services" }],
  });
  const byId = new Map(items.map((item) => [item.id, item]));

  it("draws the configured number of questions deterministically", () => {
    expect(drawAssessmentItems(items, 42, 5)).toHaveLength(5);
    expect(drawAssessmentItems(items, 42, 5).map((item) => item.id)).toEqual(drawAssessmentItems(items, 42, 5).map((item) => item.id));
    expect(drawAssessmentItems(items, 42, 99)).toHaveLength(items.length);
  });

  it("follows the 30/50/20 difficulty mix and always includes an explain-your-answer item", () => {
    expect(difficultyTargets(8)).toEqual({ easy: 2, medium: 4, hard: 2 });
    expect(difficultyTargets(10)).toEqual({ easy: 3, medium: 5, hard: 2 });
    for (let seed = 1; seed <= 200; seed += 1) {
      const drawn = drawAssessmentItems(items, seed, 8);
      const counts = { easy: 0, medium: 0, hard: 0 };
      for (const item of drawn) counts[difficultyOf(item)] += 1;
      expect(counts).toEqual(difficultyTargets(8));
      expect(drawn.some((item) => item.type === "scenario" || item.type === "short_answer")).toBe(true);
      expect(new Set(drawn.map((item) => item.id)).size).toBe(8);
    }
  });

  it("counts the distinct balanced sets a pool can produce", () => {
    expect(items).toHaveLength(QUESTION_POOL_TARGET.poolSize);
    expect(new Set(items.map((item) => item.prompt)).size).toBe(items.length);
    expect(questionSetCapacity(items.slice(0, 12), 8)).toBe(90);
    expect(questionSetCapacity(items, 8)).toBe(2099);
    expect(questionSetCapacity(items, 8)).toBeGreaterThanOrEqual(
      QUESTION_POOL_TARGET.expectedInvitesPerVersion * QUESTION_POOL_TARGET.capacityPerInvite,
    );
  });

  it("measures repeats at 500 and 1,000 invitations for the 12- and 16-question pools", () => {
    const results: Array<Record<string, number>> = [];
    for (const pool of [items.slice(0, 12), items]) {
      for (const invites of [500, 1000]) {
        const setUses = new Map<string, number>();
        let repeats = 0;
        let flagged = 0;
        let seed = 1;
        for (let index = 0; index < invites; index += 1) {
          seed = (seed * 48271) % 2147483647;
          const drawn = drawUnusedAssessmentItems({ items: pool, seed, count: 8, setUses });
          const key = questionSetKey(drawn.items.map((item) => item.id));
          const counts = { easy: 0, medium: 0, hard: 0 };
          for (const item of drawn.items) counts[difficultyOf(item)] += 1;
          expect(counts).toEqual(difficultyTargets(8));
          if (setUses.has(key)) repeats += 1;
          if (!drawn.unique) flagged += 1;
          setUses.set(key, (setUses.get(key) ?? 0) + 1);
        }
        const capacity = questionSetCapacity(pool, 8);
        const maxUses = Math.max(...setUses.values());
        results.push({ pool: pool.length, capacity, invites, distinct: setUses.size, repeats, flagged, maxUsesOfOneSet: maxUses });
        expect(repeats).toBe(flagged);
        expect(repeats).toBe(Math.max(0, invites - capacity));
        expect(maxUses).toBeLessThanOrEqual(Math.ceil(invites / capacity) + 2);
      }
    }
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/question-variety.json", `${JSON.stringify(results, null, 2)}\n`);
    expect(results.filter((row) => row.pool === 16).every((row) => row.repeats === 0)).toBe(true);
  });

  it("reports a repeat instead of looping when the pool has no unused set", () => {
    const tiny = items.slice(0, 3);
    const uses = new Map([[questionSetKey(tiny.map((item) => item.id)), 1]]);
    expect(drawUnusedAssessmentItems({ items: tiny, seed: 5, count: 3, setUses: uses }).unique).toBe(false);
  });

  it("keeps only known integrity counters and seconds for questions the candidate was given", () => {
    const order = [items[0]!.id, items[1]!.id];
    expect(sanitizeIntegrity({ tabSwitches: 3.7, pastes: -2, itemSeconds: { [order[0]!]: 61, other: 5 }, score: 100 }, order)).toEqual({
      tabSwitches: 3,
      pastes: 0,
      itemSeconds: { [order[0]!]: 61 },
    });
    expect(sanitizeIntegrity("x", order)).toBeNull();
  });

  it("rejects answers to questions the candidate was not given and out-of-range choices", () => {
    const order = items.slice(0, 4).map((item) => item.id);
    const unseen = items[5]!.id;
    expect(validateAnswerPatch({ patch: { [unseen]: "x" }, order, items: byId }).ok).toBe(false);
    const mcq = items.slice(0, 4).find((item) => item.type === "multiple_choice")!;
    expect(validateAnswerPatch({ patch: { [mcq.id]: "9" }, order, items: byId }).ok).toBe(false);
    expect(validateAnswerPatch({ patch: { [mcq.id]: "0" }, order, items: byId }).ok).toBe(true);
    expect(validateAnswerPatch({ patch: [], order, items: byId }).ok).toBe(false);
    const written = items.slice(0, 4).find((item) => item.type !== "multiple_choice")!;
    expect(validateAnswerPatch({ patch: { [written.id]: "x".repeat(20_001) }, order, items: byId }).ok).toBe(false);
  });

  it("ends the attempt at the timer or the link expiry, whichever is first, with extra time applied", () => {
    const startedAt = new Date("2026-10-19T10:00:00Z");
    const farExpiry = new Date("2026-10-25T00:00:00Z");
    expect(attemptDeadline({ startedAt, expiresAt: farExpiry, limitMinutes: 20, extraTime: false }).toISOString()).toBe("2026-10-19T10:20:00.000Z");
    expect(attemptDeadline({ startedAt, expiresAt: farExpiry, limitMinutes: 20, extraTime: true }).toISOString()).toBe("2026-10-19T10:30:00.000Z");
    const nearExpiry = new Date("2026-10-19T10:05:00Z");
    expect(attemptDeadline({ startedAt, expiresAt: nearExpiry, limitMinutes: 20, extraTime: false })).toEqual(nearExpiry);
  });
});

describe("screening funnel", () => {
  const base: ScreeningFunnelSnapshot = {
    createdAt: new Date("2026-10-01T00:00:00Z"),
    status: "CV_POOL",
    shortlistedAt: null,
    basicInvitedAt: null,
    basicStartedAt: null,
    basicSubmittedAt: null,
    basicGraded: false,
    practicalAssignedAt: null,
    practicalSubmittedAt: null,
    practicalGraded: false,
    humanDecided: false,
  };

  it("uses each step's own denominator and leaves rates blank when it is zero", () => {
    const funnel = buildScreeningFunnel([
      { ...base, basicInvitedAt: new Date("2026-10-01T01:00:00Z"), basicStartedAt: new Date("2026-10-01T02:00:00Z"), basicSubmittedAt: new Date("2026-10-01T03:00:00Z"), basicGraded: true },
      { ...base, basicInvitedAt: new Date("2026-10-01T01:00:00Z") },
      base,
      { ...base, status: "HIRED" },
    ]);
    const step = (key: string) => funnel.steps.find((row) => row.key === key)!;
    expect(step("basic-invited")).toMatchObject({ count: 2, denominator: 4, rate: 50 });
    expect(step("basic-submitted")).toMatchObject({ count: 1, denominator: 2, rate: 50 });
    expect(step("basic-graded")).toMatchObject({ count: 1, denominator: 1, rate: 100 });
    expect(step("practical-submitted")).toMatchObject({ count: 0, denominator: 0, rate: null });
    expect(step("hired")).toMatchObject({ count: 1, denominator: 4, rate: 25 });
    expect(funnel.medians.inviteToBasicSubmitHours).toBe(2);
    expect(funnel.medians.assignToPracticalSubmitHours).toBeNull();
    expect(funnel.medians.basicDurationMinutes).toBe(60);
    expect(step("basic-submitted").dropOff).toBe(1);
    expect(step("practical-submitted").dropOff).toBe(0);
  });

  it("estimates recruiter labour only and reports a net cost as negative", () => {
    expect(estimateRecruiterTimeSaved({ applied: 500, humanDecided: 40, practicalGraded: 30, basicNeedsHumanGrading: 20 })).toMatchObject({
      baselineMinutes: 3000,
      stagedMinutes: 40 * 6 + 30 * 15 + 20 * 3,
      breakdown: { reviewMinutes: 240, practicalMinutes: 450, writtenMinutes: 60 },
      savedMinutes: 3000 - 750,
    });
    expect(estimateRecruiterTimeSaved({ applied: 2, humanDecided: 2, practicalGraded: 2, basicNeedsHumanGrading: 2 }).savedMinutes).toBe(12 - (12 + 30 + 6));
    expect(buildScreeningFunnel([]).timeSaved.savedMinutes).toBe(0);
  });

  it("does not charge recruiter grading time for fully auto-scored basic assessments", () => {
    const at = new Date("2026-01-01T00:00:00Z");
    const base: ScreeningFunnelSnapshot = {
      createdAt: at, status: "APPLIED" as ScreeningFunnelSnapshot["status"], shortlistedAt: null,
      basicInvitedAt: at, basicStartedAt: at, basicSubmittedAt: at, basicGraded: true,
      practicalAssignedAt: null, practicalSubmittedAt: null, practicalGraded: false, humanDecided: false,
    };
    const funnel = buildScreeningFunnel([base, base, { ...base, basicGraded: false }]);
    expect(funnel.timeSaved.breakdown.writtenMinutes).toBe(3);
    expect(funnel.timeSaved.savedMinutes).toBe(3 * 6 - 3);
  });
});

describe("screening queue paging", () => {
  function input(applicationId: number, basic: number): CandidateInput {
    return {
      applicationId,
      closed: false,
      humanReviewRequested: false,
      parseIssue: false,
      basic: { state: "COMPLETED", percent: basic, versionKey: "generated:1" },
      practical: { state: "GRADED", percent: 80, versionKey: "rubric:a" },
      evidence: { state: "ANALYSED", supported: 3, total: 4, source: "APPROVED_REQUIREMENTS" },
      eligibility: { knockoutFailed: false, requiredNotMet: 0, requiredUnknown: 0 },
    };
  }

  it("ranks across the whole pool and returns only the requested page", () => {
    const inputs = Array.from({ length: 60 }, (_, index) => input(index + 1, index));
    const { evaluations, summary } = prioritizeCandidates(inputs, DEFAULT_SCREENING_POLICY);
    const rows: ScreeningRow[] = evaluations.map((evaluation) => ({
      applicationId: evaluation.applicationId,
      name: `Candidate ${evaluation.applicationId}`,
      title: null,
      currentEmployer: null,
      status: "CV_POOL",
      closed: false,
      appliedAt: new Date(2026, 9, evaluation.applicationId % 28 + 1).toISOString(),
      optedOut: false,
      humanReview: false,
      knockout: "none",
      parseIssue: false,
      basicSource: "generated",
      generatedInviteId: null,
      practicalId: null,
      requirementsApproved: true,
      evaluation,
    }));
    const pool: ScreeningPool = {
      job: { id: 1, title: "Role", companyId: 1 },
      policy: DEFAULT_SCREENING_POLICY,
      rows,
      summary,
      truncated: false,
      evidenceSource: "APPROVED_REQUIREMENTS",
    };
    const first = queryScreeningPool(pool, { view: "all", sort: "priority", stage: "", search: "", flag: "", page: 1 });
    expect(first.total).toBe(60);
    expect(first.pageCount).toBe(3);
    expect(first.rows).toHaveLength(25);
    expect(first.rows[0]!.applicationId).toBe(60);
    const last = queryScreeningPool(pool, { view: "all", sort: "priority", stage: "", search: "", flag: "", page: 99 });
    expect(last.page).toBe(3);
    expect(last.rows.at(-1)!.applicationId).toBe(1);
    const searched = queryScreeningPool(pool, { view: "all", sort: "priority", stage: "", search: "candidate 7", flag: "", page: 1 });
    expect(searched.rows.map((row) => row.applicationId)).toEqual([7]);
  });
});

describe("screening four-fifths monitoring", () => {
  const people = (group: string | null, size: number, passed: number) =>
    Array.from({ length: size }, (_, index) => ({ group, inBase: true, passed: index < passed }));

  it("flags a ratio under 0.8 only between groups of 30 or more", () => {
    const result = fourFifths([...people("a", 40, 20), ...people("b", 40, 10), ...people("c", 12, 0)]);
    expect(result.compared).toEqual(["b", "a"]);
    expect(result.impactRatio).toBe(0.5);
    expect(result.flagged).toBe(true);
    expect(result.groups.find((row) => row.group === "c")).toMatchObject({ hidden: false, rate: 0 });
  });

  it("hides small cells, refuses to compare small samples, and never divides by zero", () => {
    const small = fourFifths([...people("a", 40, 20), ...people("b", 9, 1)]);
    expect(small.groups.find((row) => row.group === "b")).toMatchObject({ hidden: true, people: 0, rate: null });
    expect(small.impactRatio).toBeNull();
    expect(small.flagged).toBe(false);
    expect(small.limitation).toMatch(/Fewer than two/);
    const none = fourFifths([...people("a", 30, 0), ...people("b", 30, 0)]);
    expect(none.impactRatio).toBeNull();
    expect(none.limitation).toMatch(/undefined/);
    expect(fourFifths([]).groups).toEqual([]);
  });

  it("counts undisclosed answers without comparing them", () => {
    const result = fourFifths([...people(null, 50, 0), ...people("prefer_not", 50, 0), ...people("a", 30, 15), ...people("b", 30, 15)]);
    expect(result.undisclosed).toBe(100);
    expect(result.groups.map((row) => row.group)).toEqual(["a", "b"]);
    expect(result.impactRatio).toBe(1);
    expect(result.flagged).toBe(false);
  });
});
