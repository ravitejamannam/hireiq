import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { judgeSharedEmailState, type SharedEmailRow } from "./e2e-probes";

const row = (companyId: number, n: number, over: Partial<SharedEmailRow> = {}): SharedEmailRow => ({
  submissionId: n,
  distributionId: 100 + n,
  companyId,
  candidateId: 10 + n,
  candidateCompanyId: companyId,
  applicationId: 20 + n,
  applicationCompanyId: companyId,
  applicationCandidateId: 10 + n,
  applicationsOnCandidate: 1,
  ...over,
});

describe("judgeSharedEmailState", () => {
  it("passes when each company has its own candidate and application", () => {
    const verdict = judgeSharedEmailState([row(1, 1), row(2, 2)], [1, 2]);
    expect(verdict.status).toBe("PASS");
  });

  it("fails when the repeat submission created a second application for the candidate", () => {
    expect(judgeSharedEmailState([row(1, 1, { applicationsOnCandidate: 2 }), row(2, 2)], [1, 2]).status).toBe("FAIL");
  });

  it("fails when one candidate record is shared between the companies", () => {
    const shared = judgeSharedEmailState([row(1, 1), row(2, 2, { candidateId: 11, applicationCandidateId: 11 })], [1, 2]);
    expect(shared.status).toBe("FAIL");
    expect(shared.detail).toContain("shared between companies");
  });

  it("fails when a candidate or application is owned by the wrong company", () => {
    expect(judgeSharedEmailState([row(1, 1, { candidateCompanyId: 2 }), row(2, 2)], [1, 2]).status).toBe("FAIL");
    expect(judgeSharedEmailState([row(1, 1, { applicationCompanyId: 2 }), row(2, 2)], [1, 2]).status).toBe("FAIL");
    expect(judgeSharedEmailState([row(1, 1, { applicationCandidateId: 999 }), row(2, 2)], [1, 2]).status).toBe("FAIL");
  });

  it("fails on missing rows, a missing company, a missing candidate or a shared distribution", () => {
    expect(judgeSharedEmailState([row(1, 1)], [1, 2]).status).toBe("FAIL");
    expect(judgeSharedEmailState([row(1, 1), row(3, 2)], [1, 2]).status).toBe("FAIL");
    expect(judgeSharedEmailState([row(1, 1, { candidateId: null }), row(2, 2)], [1, 2]).status).toBe("FAIL");
    expect(judgeSharedEmailState([row(1, 1), row(2, 2, { distributionId: 101 })], [1, 2]).status).toBe("FAIL");
    expect(judgeSharedEmailState([], [1, 2]).status).toBe("FAIL");
  });
});

describe("e2e-full-followup probes", () => {
  const source = readFileSync("scripts/e2e-full-followup.ts", "utf8");

  it("checks stored ownership, not a candidate name", () => {
    expect(source).not.toContain('name: "Shared Person" }, select');
    expect(source).toContain("judgeSharedEmailState(sharedRows, [nimbus.id, kaveri.id])");
    expect(source).toContain("hostedApplySubmission.findMany");
  });

  it("marks scheduling BLOCKED and never counts an exception as a pass", () => {
    expect(source).not.toContain("createSlotsForJobForAdmin");
    expect(source).toContain('blocked("scheduling slot creation"');
    expect(source).toContain('blocked("scheduling refuses another company');
    expect(source).not.toMatch(/record\("scheduling[^\n]*true/);
    expect(source).not.toContain("platform-unchecked");
    expect(source).toContain('status: "BLOCKED", ok: false');
  });
});

import { pickAssessmentApplicant } from "./e2e-probes";

describe("pickAssessmentApplicant", () => {
  const person = (name: string, over: Partial<{ aiPreference: string; aiEvaluationOptOut: boolean; humanReviewRequestedAt: Date | null }> = {}) => ({
    aiPreference: "ALLOWED",
    aiEvaluationOptOut: false,
    humanReviewRequestedAt: null,
    candidate: { name },
    ...over,
  });
  const target = "nimbus Applicant 4";

  it("chooses the named applicant when AI is allowed", () => {
    const row = person(target);
    expect(pickAssessmentApplicant([person("nimbus Applicant 2"), row], target)).toBe(row);
  });

  it("never chooses an opted-out, refused, unknown or human-review applicant", () => {
    expect(pickAssessmentApplicant([person(target, { aiEvaluationOptOut: true })], target)).toBeNull();
    expect(pickAssessmentApplicant([person(target, { aiPreference: "REFUSED", aiEvaluationOptOut: true })], target)).toBeNull();
    expect(pickAssessmentApplicant([person(target, { aiPreference: "UNKNOWN", aiEvaluationOptOut: true })], target)).toBeNull();
    expect(pickAssessmentApplicant([person(target, { humanReviewRequestedAt: new Date() })], target)).toBeNull();
  });

  it("does not fall back to a different applicant", () => {
    expect(pickAssessmentApplicant([person("nimbus Applicant 2")], target)).toBeNull();
  });
});

describe("followup consent fixture", () => {
  const source = readFileSync("scripts/e2e-full-followup.ts", "utf8");
  it("sets AI consent through the form answer, not by writing the flag", () => {
    expect(source).toContain('aiEvaluation: "allowed"');
    expect(source).toContain('aiEvaluation: "human_only"');
    expect(source).not.toContain("aiEvaluationOptOut: true");
  });
  it("keeps the assessment selector consent-based", () => {
    const flows = readFileSync("scripts/e2e-remaining-flows.ts", "utf8");
    expect(flows).toContain("pickAssessmentApplicant(rows");
    expect(flows).not.toMatch(/aiEvaluationOptOut:\s*false/);
  });
});

import { judgeRediscovery, rediscoveryExpectation, type RediscoveryFixtureState } from "./e2e-probes";

describe("rediscovery probe", () => {
  const fx = (key: string, id: number, over: Partial<RediscoveryFixtureState> = {}): RediscoveryFixtureState => ({
    key, candidateId: id, hasResume: true, futureRolesConsent: true, aiPreference: "ALLOWED", withdrawn: false, activeOnTargetJob: false, ...over,
  });
  const set = () => [
    fx("eligible", 1),
    fx("no-resume", 2, { hasResume: false }),
    fx("opted-out", 3, { aiPreference: "REFUSED" }),
    fx("withdrawn", 4, { withdrawn: true }),
    fx("no-consent", 5, { futureRolesConsent: false }),
  ];

  it("derives expectation from stored state", () => {
    expect(rediscoveryExpectation(fx("a", 1)).eligible).toBe(true);
    expect(rediscoveryExpectation(fx("a", 1, { aiPreference: "UNKNOWN" })).eligible).toBe(false);
    expect(rediscoveryExpectation(fx("a", 1, { activeOnTargetJob: true })).eligible).toBe(false);
  });

  it("passes when only the eligible fixture is returned", () => {
    expect(judgeRediscovery(set(), [1, 99]).status).toBe("PASS");
  });

  it("fails when the eligible fixture is missing, even if the result is empty", () => {
    expect(judgeRediscovery(set(), []).status).toBe("FAIL");
  });

  it("fails when any ineligible fixture is returned", () => {
    for (const id of [2, 3, 4, 5]) expect(judgeRediscovery(set(), [1, id]).status).toBe("FAIL");
  });

  it("cannot pass without both an eligible and an ineligible fixture", () => {
    expect(judgeRediscovery([fx("a", 1, { aiPreference: "UNKNOWN" })], []).status).toBe("FAIL");
    expect(judgeRediscovery([fx("a", 1)], [1]).status).toBe("FAIL");
  });

  it("scripts record rediscovery only from the judged result", () => {
    const flows = readFileSync("scripts/e2e-remaining-flows.ts", "utf8");
    const followup = readFileSync("scripts/e2e-full-followup.ts", "utf8");
    expect(flows).toContain('record("rediscovery inclusion and exclusion", verdict.status === "PASS"');
    expect(flows).not.toContain("expected ${eligible}");
    expect(flows).not.toMatch(/aiEvaluationOptOut:\s*(true|false)\s*[,}]\s*\n?\s*(where|data)/);
    expect(followup).not.toMatch(/record\("rediscovery"/);
  });
});
