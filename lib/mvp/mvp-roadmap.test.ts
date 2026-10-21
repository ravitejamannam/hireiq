import { describe, expect, it } from "vitest";

import { assertPinnedMetrics } from "@/lib/ai/eval-harness";
import { evidenceFlagMayDefaultOn, isFeatureEnabled, NAME_SWAP_FLIP_THRESHOLD } from "@/lib/ai/feature-flags";
import { assertEvaluationAllowed, hashGatewayInput } from "@/lib/ai/gateway";
import { evaluationAllowed, humanReviewTask } from "@/lib/ai/opt-out";
import { redactEvaluationPii } from "@/lib/ai/pii-redaction";
import { getPrompt } from "@/lib/ai/prompt-registry";
import { auditCoversMutation, rejectAuditMutation } from "@/lib/audit/audit-immutability";
import { gradeKnockouts } from "@/lib/apply/knockout";
import { aiActionRates, timeInStageHours } from "@/lib/analytics/mvp-metrics";
import { duplicateGroups, recordConsent } from "@/lib/candidates/duplicate-merge";
import { nameSwapFlipRate } from "@/lib/evidence/name-swap";
import { evidenceVisible, gateMeets, overrideRate, rankingMayChangeApplicationStatus } from "@/lib/evidence/review-status";
import { coverageGaps, debrief, nearDuplicate, notesToEvidenceDraft, questionAllowed, scorecardsVisible } from "@/lib/interviews/kit-coverage";
import { diffRequirementLines, renderJobDescription } from "@/lib/jobs/jd-render";
import { dismissLint, lintJobDescription } from "@/lib/jobs/jd-linter";
import { decisionRecord, jobApprovedForPublish, parseCandidateCsv, rejectionEmailDraft, rejectionReason } from "@/lib/jobs/mvp-catalogue";
import { assertPublishableRequirements, reorderRequirements } from "@/lib/jobs/requirement-approval";
import { draftRequirementsFromExtraction } from "@/lib/jobs/requirement-drafts";
import { portalView } from "@/lib/portal/candidate-portal";
import { anonymiseCandidate, retentionDays } from "@/lib/privacy/retention";
import { buildCandidateReport, nextReportVersion } from "@/lib/reports/candidate-report";
import { hiddenSpans, offsetsOf, stripHiddenText } from "@/lib/resumes/hidden-text";
import { executeWorkflow, previewWorkflow } from "@/lib/workflow/engine";

describe("phase 0 gateway and consent", () => {
  it("hashes inputs and refuses evaluation after opt-out", () => {
    expect(hashGatewayInput({
      feature: "evidence_review",
      model: "gpt-4o-mini",
      promptVersion: "1",
      system: "s",
      user: "u",
    })).toHaveLength(64);
    expect(() => assertEvaluationAllowed({ feature: "evidence_review", optedOut: true })).toThrow(/opted out/);
    expect(evaluationAllowed({ aiEvaluationOptOut: true, humanReviewRequestedAt: null })).toBe(false);
    expect(humanReviewTask({
      applicationId: 4,
      aiEvaluationOptOut: false,
      humanReviewRequestedAt: new Date("2026-01-01"),
    })?.kind).toBe("HUMAN_REVIEW");
  });

  it("redacts name and contact and reads flags immediately", () => {
    expect(redactEvaluationPii({
      text: "Ada Lovelace ada@example.com 555-010-1212",
      name: "Ada Lovelace",
    })).not.toMatch(/Ada|ada@|555/);
    expect(isFeatureEnabled([{ feature: "evidence", enabled: false }], "evidence")).toBe(false);
    expect(isFeatureEnabled([{ feature: "evidence", enabled: true }], "evidence")).toBe(true);
    expect(getPrompt("job_description").timeoutMs).toBeLessThanOrEqual(20_000);
  });

  it("fails when a pinned metric drops and refuses audit mutation", () => {
    expect(() => assertPinnedMetrics([{ name: "parse", minimum: 0.9, actual: 0.5 }])).toThrow(/regression/);
    expect(() => rejectAuditMutation("delete")).toThrow(/append-only/);
    expect(auditCoversMutation("REQUIREMENT_EDITED")).toBe(true);
  });
});

describe("phase 1 and 2 requirements and JD", () => {
  it("keeps extraction as drafts that cite the source", () => {
    const drafts = draftRequirementsFromExtraction([
      { text: "Five years of TypeScript.", source: "Five years of TypeScript. Nice to have: GraphQL." },
      { text: "Not in source", source: "Other text." },
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.approvalStatus).toBe("DRAFT");
  });

  it("blocks publish without an approved required item and renders only approved rows", () => {
    expect(() => assertPublishableRequirements([{
      id: 1,
      requirementType: "REQUIRED",
      evidenceType: null,
      approvalStatus: "DRAFT",
      displayOrder: 0,
    }])).toThrow(/approved required/);
    const rendered = renderJobDescription({
      narrative: {
        summary: "Summary",
        outcomes: "Ship the billing API.",
        responsibilities: "Own the service.",
        process: "Two interviews.",
        benefits: "Health cover.",
      },
      requirements: [
        { id: 7, requirementType: "REQUIRED", sourceText: "TypeScript", approvalStatus: "APPROVED" },
        { id: 8, requirementType: "PREFERRED", sourceText: "GraphQL", approvalStatus: "DRAFT" },
      ],
    });
    expect(rendered).toContain("[req:7]");
    expect(rendered).not.toContain("[req:8]");
    expect(diffRequirementLines(rendered.replace("[req:7]", "[req:99]"), [
      { id: 7, requirementType: "REQUIRED", sourceText: "TypeScript", approvalStatus: "APPROVED" },
    ]).length).toBeGreaterThan(0);
    expect(reorderRequirements([{ id: 2, displayOrder: 0 }, { id: 1, displayOrder: 1 }], [1, 2])[0]?.id).toBe(1);
  });

  it("warns without rewriting and stores a dismissal reason", () => {
    const findings = lintJobDescription({
      text: "We need a young ninja.",
      location: "California",
      payBand: null,
      level: "junior",
      requiredCount: 8,
      yearsRequired: 8,
      degreeRequired: true,
      degreeJustification: null,
    });
    expect(findings.map((row) => row.ruleId)).toEqual(expect.arrayContaining([
      "gendered-language",
      "age-coded-language",
      "missing-pay",
      "required-count",
      "years-vs-level",
      "degree-justification",
    ]));
    expect(dismissLint({ ruleId: "missing-pay", reason: "Staffing agency posts pay later." }).reason).toMatch(/agency/);
  });
});

describe("phase 3 interviews", () => {
  it("covers required items, hides other scorecards, and drafts notes without ratings", () => {
    expect(coverageGaps([{ id: 1, requirementType: "REQUIRED", coveredBy: [] }])).toHaveLength(1);
    expect(questionAllowed("What is your religion?")).toBe(false);
    expect(nearDuplicate("Tell me about TypeScript.", ["tell me about typescript"])).toBe(true);
    expect(scorecardsVisible({
      viewerSubmitted: false,
      viewerId: 3,
      cards: [
        { interviewerId: 3, submitted: false },
        { interviewerId: 4, submitted: true },
      ],
    })).toEqual([{ interviewerId: 3, submitted: false }]);
    expect(notesToEvidenceDraft("Cited the billing migration.").rating).toBeNull();
    expect(debrief({
      requirements: [{ id: 1 }, { id: 2 }],
      scorecards: [
        { interviewerId: 1, ratings: { 1: 3, 2: 5 }, evidence: [1] },
        { interviewerId: 2, ratings: { 1: 3, 2: 1 }, evidence: [1] },
      ],
    })).toEqual({ agreements: [1], disagreements: [2], missingEvidence: [2] });
  });
});

describe("phase 4 workflow", () => {
  it("previews and blocks rejection without a human or knockout", () => {
    const rule = {
      id: 9,
      version: 2,
      trigger: "STAGE_CHANGE" as const,
      condition: { status: "REJECTED" },
      action: { type: "REJECT" as const },
    };
    expect(previewWorkflow(rule, { trigger: "STAGE_CHANGE", status: "REJECTED" }).matched).toBe(true);
    expect(executeWorkflow(rule, { trigger: "STAGE_CHANGE", status: "REJECTED" }).outcome).toBe("BLOCKED");
    expect(executeWorkflow(rule, {
      trigger: "STAGE_CHANGE",
      status: "REJECTED",
      knockoutFailed: true,
    }).outcome).toBe("BLOCKED");
    expect(executeWorkflow(rule, {
      trigger: "STAGE_CHANGE",
      status: "REJECTED",
      humanConfirmed: true,
    }).outcome).toBe("EXECUTED");
    expect(executeWorkflow({
      ...rule,
      action: { type: "EMAIL" },
    }, { trigger: "STAGE_CHANGE", status: "REJECTED", unsubscribed: true }).outcome).toBe("BLOCKED");
  });
});

describe("phase 5 intake", () => {
  it("strips hidden text and keeps offsets", () => {
    const injections = Array.from({ length: 20 }, (_, index) => ({
      text: `inject-${index}`,
      fontSize: 2,
      contrast: 1,
      offPage: false,
    }));
    const detected = hiddenSpans(injections);
    expect(detected.length / injections.length).toBeGreaterThanOrEqual(0.95);
    const clean = stripHiddenText({
      visibleText: "Visible experience",
      spans: [{ text: "Visible experience", fontSize: 12, contrast: 1, offPage: false }],
    });
    expect(clean.flagged).toHaveLength(0);
    expect(offsetsOf("TypeScript in production", "TypeScript")).toEqual({ start: 0, end: 10 });
  });

  it("rejects knockout misses and groups duplicate identities", () => {
    expect(gradeKnockouts({
      questions: [{ id: 1, expectedAnswer: "yes" }],
      answers: [{ questionId: 1, answer: "no" }],
    }).rejectByRule).toBe(true);
    expect(duplicateGroups([
      { candidateId: 1, email: "A@example.com" },
      { candidateId: 2, email: "a@example.com" },
      { candidateId: 3, email: "other@example.com" },
    ])).toEqual([[1, 2]]);
    expect(recordConsent({ noticeVersion: "n1", at: new Date("2026-02-01T00:00:00Z") }).applyNoticeVersion).toBe("n1");
  });
});

describe("phase 6 evidence", () => {
  it("downgrades a meets status whose quote is not verbatim", () => {
    expect(gateMeets({ proposed: "MEETS", source: "Led the billing API.", quote: "Led the API" })).toBe("UNKNOWN");
    expect(gateMeets({ proposed: "MEETS", source: "Led the billing API.", quote: "billing API" })).toBe("MEETS");
    expect(evidenceVisible({ companyEnabled: true, jobEnabled: true, candidateOptedOut: true })).toBe(false);
    expect(rankingMayChangeApplicationStatus()).toBe(false);
    expect(overrideRate([{ overridden: true }, { overridden: false }])).toBe(0.5);
    const rate = nameSwapFlipRate({
      baseline: [{ applicationId: 1, status: "MEETS" }, { applicationId: 2, status: "UNKNOWN" }],
      swapped: [{ applicationId: 1, status: "MEETS" }, { applicationId: 2, status: "UNKNOWN" }],
    });
    expect(rate).toBeLessThan(NAME_SWAP_FLIP_THRESHOLD);
    expect(evidenceFlagMayDefaultOn(rate)).toBe(true);
    expect(evidenceFlagMayDefaultOn(0.2)).toBe(false);
  });
});

describe("phase 7 portal and report", () => {
  it("shows only the actor's applications and versions the report when inputs change", () => {
    expect(portalView({
      actorCandidateId: 5,
      applications: [
        { id: 1, candidateId: 5, status: "CV_POOL", interviews: [], assessmentLinks: [], documents: [], notice: "AI draft", optedOut: false },
        { id: 2, candidateId: 9, status: "CV_POOL", interviews: [], assessmentLinks: [], documents: [], notice: null, optedOut: false },
      ],
    }).map((row) => row.id)).toEqual([1]);
    const report = buildCandidateReport({
      requirements: [{ id: 7, text: "TypeScript", status: "MEETS", quote: "TypeScript" }],
      assessments: [],
      scorecards: [],
      timeline: [],
    });
    expect(report.narrative).toContain("requirement 7");
    expect(nextReportVersion(report.inputHash, report.inputHash, 3)).toBe(3);
    expect(nextReportVersion(report.inputHash, "other", 3)).toBe(4);
  });
});

describe("phase 8 operations", () => {
  it("covers retention, rejection, import, and AI action rates", () => {
    expect(retentionDays("CALIFORNIA")).toBeGreaterThan(retentionDays("GDPR"));
    expect(anonymiseCandidate({ name: "Ada", email: "ada@example.com", phone: "1" }).phone).toBeNull();
    expect(rejectionReason("KNOCKOUT").label).toMatch(/Knockout/);
    expect(rejectionEmailDraft({ candidateName: "Ada", role: "Engineer", reasonLabel: "Role closed" }).requiresHumanSend).toBe(true);
    expect(decisionRecord({ applicationId: 1, rationale: "Panel agreed.", decidedByUserId: 2 }).rationale).toMatch(/Panel/);
    expect(parseCandidateCsv("name,email\nAda,ada@example.com")).toEqual([{ name: "Ada", email: "ada@example.com" }]);
    expect(jobApprovedForPublish({ publishApprovedAt: null })).toBe(false);
    expect(timeInStageHours([
      { applicationId: 1, status: "CV_POOL", at: "2026-01-01T00:00:00Z" },
      { applicationId: 1, status: "SHORTLISTED", at: "2026-01-01T02:00:00Z" },
    ])[0]?.hours).toBe(2);
    expect(aiActionRates([{ reviewerAction: "ACCEPTED" }, { reviewerAction: "OVERRIDDEN" }]).override).toBe(0.5);
  });
});
