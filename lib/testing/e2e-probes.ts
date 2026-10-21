/**
 * Pure judgement for E2E probes, so the rules can be tested without a database.
 *
 * Hosted apply de-duplicates on (distribution, normalised email): a second submission of one email to the same
 * role returns the first submission and creates no new candidate. Candidates and applications are scoped to the
 * company that owns the role. So one email applying to two companies must leave exactly one candidate and one
 * application per company, owned by that company and not shared between them.
 */
export type SharedEmailRow = {
  submissionId: number;
  distributionId: number;
  companyId: number;
  candidateId: number | null;
  candidateCompanyId: number | null;
  applicationId: number | null;
  applicationCompanyId: number | null;
  applicationCandidateId: number | null;
  applicationsOnCandidate: number;
};

export type ProbeStatus = "PASS" | "FAIL" | "BLOCKED";

export function judgeSharedEmailState(rows: SharedEmailRow[], expectedCompanyIds: number[]): { status: ProbeStatus; detail: string } {
  const fail = (detail: string) => ({ status: "FAIL" as const, detail });
  if (rows.length !== expectedCompanyIds.length) {
    return fail(`expected ${expectedCompanyIds.length} submissions for the shared email (one per company), found ${rows.length}`);
  }
  const byCompany = new Map(rows.map((row) => [row.companyId, row]));
  if (byCompany.size !== rows.length || !expectedCompanyIds.every((id) => byCompany.has(id))) {
    return fail("the shared email does not have exactly one submission in each expected company");
  }
  if (new Set(rows.map((row) => row.distributionId)).size !== rows.length) return fail("submissions share a distribution");
  for (const row of rows) {
    if (row.candidateId === null || row.applicationId === null) return fail(`company ${row.companyId}: submission ${row.submissionId} has no candidate or application`);
    if (row.candidateCompanyId !== row.companyId) return fail(`company ${row.companyId}: candidate belongs to company ${row.candidateCompanyId}`);
    if (row.applicationCompanyId !== row.companyId) return fail(`company ${row.companyId}: application belongs to company ${row.applicationCompanyId}`);
    if (row.applicationCandidateId !== row.candidateId) return fail(`company ${row.companyId}: application points at a different candidate`);
    if (row.applicationsOnCandidate !== 1) return fail(`company ${row.companyId}: candidate has ${row.applicationsOnCandidate} applications, expected 1`);
  }
  if (new Set(rows.map((row) => row.candidateId)).size !== rows.length) return fail("one candidate record is shared between companies");
  return { status: "PASS", detail: `${rows.length} companies, one company-scoped candidate and one application each, no shared candidate` };
}

export type AssessmentCandidateRow = {
  aiPreference: string;
  aiEvaluationOptOut: boolean;
  humanReviewRequestedAt: Date | null;
  candidate: { name: string };
};

/**
 * The assessment flow needs an applicant who explicitly allowed AI evaluation (aiPreference ALLOWED, so the fail-closed
 * trigger leaves aiEvaluationOptOut false) and did not ask for human-only review. UNKNOWN or REFUSED applicants are
 * never selected; there is no fallback that ignores consent.
 */
export function pickAssessmentApplicant<T extends AssessmentCandidateRow>(rows: T[], preferredName: string): T | null {
  const eligible = rows.filter(
    (row) => row.aiPreference === "ALLOWED" && !row.aiEvaluationOptOut && row.humanReviewRequestedAt === null,
  );
  return eligible.find((row) => row.candidate.name === preferredName) ?? null;
}

export type RediscoveryFixtureState = {
  key: string;
  candidateId: number;
  /** Non-revoked evidence with non-empty inline text. runTalentRediscovery only reads such candidates. */
  hasResume: boolean;
  futureRolesConsent: boolean;
  /** aiPreference is stored as ALLOWED / REFUSED / UNKNOWN; only ALLOWED leaves aiEvaluationOptOut false. */
  aiPreference: string;
  withdrawn: boolean;
  activeOnTargetJob: boolean;
};

/**
 * Mirrors lib/talent/rediscovery.ts rediscoveryExclusion plus the resume-evidence filter in runTalentRediscovery.
 * Derived from stored state so the expectation follows what the database actually holds.
 */
export function rediscoveryExpectation(fixture: RediscoveryFixtureState): { eligible: boolean; reason: string } {
  if (!fixture.hasResume) return { eligible: false, reason: "no resume evidence" };
  if (fixture.activeOnTargetJob) return { eligible: false, reason: "active on target job" };
  if (fixture.withdrawn) return { eligible: false, reason: "withdrawn" };
  if (!fixture.futureRolesConsent) return { eligible: false, reason: "no future-roles consent" };
  if (fixture.aiPreference !== "ALLOWED") return { eligible: false, reason: "AI not permitted (opted out)" };
  return { eligible: true, reason: "eligible" };
}

/**
 * The probe needs at least one fixture that must appear and one that must not, so an empty result can never pass.
 * Only fixture candidates are compared; other candidates in the result are ignored here.
 */
export function judgeRediscovery(fixtures: RediscoveryFixtureState[], returnedCandidateIds: number[]): { status: ProbeStatus; detail: string } {
  const returned = new Set(returnedCandidateIds);
  const verdicts = fixtures.map((fixture) => ({ fixture, ...rediscoveryExpectation(fixture) }));
  const expectedIn = verdicts.filter((row) => row.eligible);
  const expectedOut = verdicts.filter((row) => !row.eligible);
  if (expectedIn.length === 0) return { status: "FAIL", detail: "fixtures contain no eligible candidate, so the probe proves nothing" };
  if (expectedOut.length === 0) return { status: "FAIL", detail: "fixtures contain no ineligible candidate" };
  const missing = expectedIn.filter((row) => !returned.has(row.fixture.candidateId)).map((row) => row.fixture.key);
  const leaked = expectedOut.filter((row) => returned.has(row.fixture.candidateId)).map((row) => `${row.fixture.key} (${row.reason})`);
  if (missing.length || leaked.length) {
    return { status: "FAIL", detail: `missing eligible: [${missing.join(", ")}]; wrongly included: [${leaked.join(", ")}]` };
  }
  return {
    status: "PASS",
    detail: `included ${expectedIn.map((row) => row.fixture.key).join(", ")}; excluded ${expectedOut.map((row) => `${row.fixture.key} (${row.reason})`).join(", ")}`,
  };
}
