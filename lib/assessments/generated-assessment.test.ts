import { describe, expect, it } from "vitest";

import {
  acceptQuotedGrade,
  autosaveAnswers,
  canPublish,
  candidateMaySeeScore,
  generateAssessmentFromRubric,
  gradeMultipleChoice,
  parseAssessmentItems,
  remainingMs,
  tokenUsable,
} from "@/lib/assessments/generated-assessment";

describe("generated assessments", () => {
  const items = generateAssessmentFromRubric({
    requirements: ["Go", "PostgreSQL", "Kubernetes", "gRPC", "5-9 years", "on-call"],
    rubric: [{ criterion: "TypeScript", signal: "Production services" }],
  });

  it("rejects an item that is not tied to a requirement", () => {
    expect(parseAssessmentItems([{ ...items[0], requirement: "" }]).success).toBe(false);
    expect(parseAssessmentItems(items.slice(0, 3)).success).toBe(false);
  });

  it("does not publish a draft until publish is allowed", () => {
    expect(canPublish("DRAFT")).toBe(true);
    expect(canPublish("PUBLISHED")).toBe(false);
  });

  it("autosaves answers and counts extra time", () => {
    expect(autosaveAnswers({ a: "one" }, { b: "two" })).toEqual({ a: "one", b: "two" });
    const started = new Date("2026-10-18T10:00:00.000Z");
    expect(remainingMs({ startedAt: started, now: new Date("2026-10-18T10:30:00.000Z"), limitMinutes: 45, extraTime: false })).toBe(15 * 60_000);
    expect(remainingMs({ startedAt: started, now: started, limitMinutes: 40, extraTime: true })).toBe(60 * 60_000);
  });

  it("grades multiple choice and rejects an LLM grade without a quote from the answer", () => {
    const mcq = items.find((item) => item.type === "multiple_choice")!;
    expect(gradeMultipleChoice(mcq, 0)?.correct).toBe(true);
    expect(gradeMultipleChoice(mcq, 1)?.score).toBe(0);
    const answer = "I shipped Postgres indexes.";
    expect(acceptQuotedGrade({ answer, quote: "not in the answer", score: 4, confidence: "high", optedOut: false, humanReview: false }).needsHuman).toBe(true);
    expect(acceptQuotedGrade({ answer, quote: "Postgres indexes", score: 4, confidence: "low", optedOut: false, humanReview: false }).needsHuman).toBe(true);
    expect(acceptQuotedGrade({ answer, quote: "Postgres indexes", score: 4, confidence: "high", optedOut: false, humanReview: false })).toMatchObject({ needsHuman: false, score: 4 });
  });

  it("sends opted-out and human-review candidates to a person, hides the score, and closes the link after submit", () => {
    expect(acceptQuotedGrade({ answer: "yes", quote: "yes", score: 5, confidence: "high", optedOut: true, humanReview: false }).reason).toBe("human-only");
    expect(acceptQuotedGrade({ answer: "yes", quote: "yes", score: 5, confidence: "high", optedOut: false, humanReview: true }).reason).toBe("human-only");
    expect(candidateMaySeeScore()).toBe(false);
    const now = new Date("2026-10-18T12:00:00.000Z");
    expect(tokenUsable({ submittedAt: now, expiresAt: new Date("2026-10-19T12:00:00.000Z"), now })).toBe(false);
    expect(tokenUsable({ submittedAt: null, expiresAt: new Date("2026-10-18T11:00:00.000Z"), now })).toBe(false);
  });
});
