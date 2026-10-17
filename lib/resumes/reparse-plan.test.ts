import { describe, expect, it } from "vitest";

import { scoreExtraction } from "@/lib/resumes/extraction-quality";
import {
  documentStillEligible,
  planReparse,
  reparseSelectionWhere,
  reparseUpdateWhere,
} from "@/lib/resumes/reparse-plan";

const CURRENT = "resume-text-v9";

describe("resume reparse plan", () => {
  it("selects only rows that have not been parsed by the current extractor", () => {
    expect(reparseSelectionWhere(CURRENT)).toEqual({
      OR: [{ extractorVersion: null }, { extractorVersion: { not: CURRENT } }],
    });
    expect(documentStillEligible(null, CURRENT)).toBe(true);
    expect(documentStillEligible("older", CURRENT)).toBe(true);
    expect(documentStillEligible(CURRENT, CURRENT)).toBe(false);
  });

  it("does not write when extraction fails, so the row stays eligible", () => {
    const plan = planReparse({
      extractedText: null,
      extraction: { ok: false, errorCode: "PDF_PARSE_FAILED" },
      currentVersion: CURRENT,
    });
    expect(plan).toEqual({ action: "fail", errorCode: "PDF_PARSE_FAILED" });
    expect(plan).not.toHaveProperty("data");
    expect(documentStillEligible(null, CURRENT)).toBe(true);
  });

  it("leaves an existing version in place when a later extract fails", () => {
    const plan = planReparse({
      extractedText: "Engineer with experience in hiring systems.",
      extraction: { ok: false, errorCode: "PARSE_TIMEOUT" },
      currentVersion: CURRENT,
    });
    expect(plan.action).toBe("fail");
    expect(documentStillEligible("older", CURRENT)).toBe(true);
  });

  it("updates when there is no saved text", () => {
    const plan = planReparse({
      extractedText: null,
      extraction: {
        ok: true,
        text: "Engineer with experience and education in software.",
        quality: { score: 0.8, needsReview: false },
      },
      currentVersion: CURRENT,
    });
    expect(plan.action).toBe("update");
    if (plan.action === "update") {
      expect(plan.data.extractorVersion).toBe(CURRENT);
      expect(plan.data.extractedText).toContain("experience");
      expect(plan.data.parseStatus).toBe("PARSED");
    }
  });

  it("keeps existing text when the new score is lower", () => {
    const saved = "Engineer with experience in hiring systems and education.";
    const previousScore = scoreExtraction(saved).score;
    const plan = planReparse({
      extractedText: saved,
      extraction: {
        ok: true,
        text: "short",
        quality: { score: previousScore - 0.1, needsReview: true },
      },
      currentVersion: CURRENT,
    });
    expect(plan.action).toBe("keep");
    expect(plan).not.toHaveProperty("data");
    expect(documentStillEligible("older", CURRENT)).toBe(true);
  });

  it("keeps existing text when the new score is equal", () => {
    const saved = "Engineer with experience in hiring systems and education.";
    const previousScore = scoreExtraction(saved).score;
    const plan = planReparse({
      extractedText: saved,
      extraction: {
        ok: true,
        text: "a different extract with the same score",
        quality: { score: previousScore, needsReview: false },
      },
      currentVersion: CURRENT,
    });
    expect(plan).toMatchObject({
      action: "keep",
      previousScore,
      nextScore: previousScore,
    });
    expect(plan).not.toHaveProperty("data");
  });

  it("updates only when the new score is strictly better", () => {
    const saved = "Engineer with experience in hiring systems and education.";
    const previousScore = scoreExtraction(saved).score;
    const plan = planReparse({
      extractedText: saved,
      extraction: {
        ok: true,
        text: "better extraction with more experience",
        quality: { score: previousScore + 0.1, needsReview: false },
      },
      currentVersion: CURRENT,
    });
    expect(plan.action).toBe("update");
    if (plan.action === "update") {
      expect(plan.previousScore).toBe(previousScore);
      expect(plan.nextScore).toBeCloseTo(previousScore + 0.1);
      expect(plan.data.extractedText).toContain("better");
      expect(plan.data.extractorVersion).toBe(CURRENT);
    }
  });

  it("requires the observed text and version before writing", () => {
    expect(
      reparseUpdateWhere({
        id: 42,
        extractedText: "kept",
        extractorVersion: "older",
      }),
    ).toEqual({
      id: 42,
      extractedText: "kept",
      extractorVersion: "older",
    });
    expect(documentStillEligible("older", CURRENT)).toBe(true);
  });
});
