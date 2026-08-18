import {
  CandidateClaimType,
  JobSpecificationVersionStatus,
  PortalRole,
} from "@prisma/client";

import {
  AuthenticationError,
  AuthorizationError,
  requireAdmin,
} from "@/lib/auth/authorization";
import {
  CandidateMatchingError,
  MATCHING_GENERIC_ERROR,
  MATCHING_IN_PROGRESS,
  MATCHING_INTERNAL_ERROR,
  MATCHING_NOT_FOUND,
  MATCHING_SPEC_JOB_MISMATCH,
  MATCHING_SPEC_NOT_FOUND,
  MATCHING_SPEC_NOT_PUBLISHED,
} from "@/lib/candidates/matching/matching-errors";
import {
  computeRequirementMatches,
  hashIntelligenceSnapshot,
} from "@/lib/candidates/matching/matching-engine";
import type {
  CandidateMatchingPageData,
  EligibleMatchingClaim,
  SafeCandidateMatchRun,
  SafeRequirementMatch,
} from "@/lib/candidates/matching/matching-types";
import {
  ALIAS_MAP_VERSION,
  MATCHER_VERSION,
  REQUIREMENT_PARSE_VERSION,
  STALE_MATCH_RUNNING_MS,
} from "@/lib/candidates/matching/matching-versions";
import { prisma } from "@/lib/prisma";
import {
  createMatchRun,
  createRequirementMatches,
  findCandidateHandle,
  findCompletedMatchRun,
  findLatestRunningMatchRun,
  getApplicationForMatching,
  getLatestCompletedIntelligenceRun,
  getMatchRunWithRows,
  getSpecificationForMatching,
  listApplicationsForCandidateMatching,
  listClaimsForRuns,
  listEligibleEvidenceForApplication,
  listMatchRunsForCandidate,
  listPublishedSpecsForJobs,
  markMatchRunCompleted,
  markMatchRunFailed,
  type CandidateMatchRunRow,
  type MatchingIdempotencyKey,
} from "@/lib/repositories/candidate-matching-repository";
import {
  CandidateMatchingValidationError,
  rejectForbiddenMatchingFields,
  validateMatchingApplicationId,
  validateMatchingCandidateId,
  validateMatchingSpecificationId,
} from "@/lib/validation/candidate-matching-validation";

function matchingNotFound(): never {
  throw new CandidateMatchingError("Resource not found.", MATCHING_NOT_FOUND);
}

export function assertCanManageCandidateMatching(role: PortalRole) {
  if (role !== PortalRole.ADMIN) {
    throw new AuthorizationError("Resource not found.");
  }
}

async function requireMatchingAdmin() {
  const user = await requireAdmin();
  assertCanManageCandidateMatching(user.role);
  return user;
}

function toSafeRequirement(
  row: CandidateMatchRunRow["requirementMatches"][number],
): SafeRequirementMatch {
  return {
    id: row.id,
    companyId: row.companyId,
    runId: row.runId,
    requirementKey: row.requirementKey,
    sourceField: row.sourceField,
    category: row.category,
    result: row.result,
    reasonCode: row.reasonCode,
    claimId: row.claimId,
    evidenceId: row.evidenceId,
    createdAt: row.createdAt,
  };
}

function toSafeRun(row: CandidateMatchRunRow): SafeCandidateMatchRun {
  return {
    id: row.id,
    companyId: row.companyId,
    applicationId: row.applicationId,
    candidateId: row.candidateId,
    jobId: row.jobId,
    jobSpecificationVersionId: row.jobSpecificationVersionId,
    status: row.status,
    matcherVersion: row.matcherVersion,
    requirementParseVersion: row.requirementParseVersion,
    aliasMapVersion: row.aliasMapVersion,
    intelligenceSnapshotHash: row.intelligenceSnapshotHash,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    errorCode: row.errorCode,
    requirementMatches: row.requirementMatches.map(toSafeRequirement),
  };
}

function logMatchEvent(
  event: "candidate_matching_started" | "candidate_matching_completed" | "candidate_matching_failed",
  metadata: Record<string, unknown>,
) {
  console.log(`[match] ${event}`, metadata);
}

function preferClaim(
  current: EligibleMatchingClaim | undefined,
  next: EligibleMatchingClaim,
) {
  if (!current) {
    return next;
  }
  if (next.runCompletedAt.getTime() !== current.runCompletedAt.getTime()) {
    return next.runCompletedAt.getTime() > current.runCompletedAt.getTime()
      ? next
      : current;
  }
  if (next.runId !== current.runId) {
    return next.runId > current.runId ? next : current;
  }
  return next.id > current.id ? next : current;
}

async function selectEligibleClaims(input: {
  companyId: number;
  candidateId: number;
  applicationId: number;
}) {
  const evidenceRows = await listEligibleEvidenceForApplication(input);
  const selectedPairs: Array<{
    evidenceId: number;
    runId: number;
    completedAt: Date;
  }> = [];

  for (const evidence of evidenceRows) {
    if (
      evidence.companyId !== input.companyId ||
      evidence.candidateId !== input.candidateId
    ) {
      continue;
    }
    const run = await getLatestCompletedIntelligenceRun(
      evidence.id,
      input.companyId,
    );
    if (!run || !run.completedAt) {
      continue;
    }
    selectedPairs.push({
      evidenceId: evidence.id,
      runId: run.id,
      completedAt: run.completedAt,
    });
  }

  const runMeta = new Map(
    selectedPairs.map((pair) => [pair.runId, pair] as const),
  );
  const claims = await listClaimsForRuns(
    selectedPairs.map((pair) => pair.runId),
    input.companyId,
    input.candidateId,
  );

  const deduped = new Map<string, EligibleMatchingClaim>();
  for (const claim of claims) {
    if (claim.companyId !== input.companyId || claim.candidateId !== input.candidateId) {
      continue;
    }
    if (
      claim.claimType !== CandidateClaimType.SKILL &&
      claim.claimType !== CandidateClaimType.LOCATION
    ) {
      continue;
    }
    const normalized = claim.normalizedValue?.trim() ?? "";
    if (!normalized) {
      continue;
    }
    const meta = runMeta.get(claim.runId);
    if (!meta || meta.evidenceId !== claim.evidenceId) {
      continue;
    }
    const key = `${claim.claimType}:${normalized}`;
    const mapped: EligibleMatchingClaim = {
      id: claim.id,
      evidenceId: claim.evidenceId,
      runId: claim.runId,
      runCompletedAt: meta.completedAt,
      claimType: claim.claimType,
      normalizedValue: normalized,
    };
    deduped.set(key, preferClaim(deduped.get(key), mapped));
  }

  return {
    claims: [...deduped.values()],
    snapshotPairs: selectedPairs.map((pair) => ({
      evidenceId: pair.evidenceId,
      runId: pair.runId,
    })),
  };
}

export async function executeRunCandidateMatching(input: {
  applicationId: number;
  jobSpecificationVersionId: number;
}): Promise<SafeCandidateMatchRun> {
  const application = await getApplicationForMatching(input.applicationId);
  if (!application) {
    matchingNotFound();
  }
  if (
    application.job.companyId !== application.companyId ||
    application.candidate.companyId !== application.companyId ||
    application.candidate.id !== application.candidateId ||
    application.job.id !== application.jobId
  ) {
    matchingNotFound();
  }

  const spec = await getSpecificationForMatching(input.jobSpecificationVersionId);
  if (!spec) {
    throw new CandidateMatchingError(
      "Specification not found.",
      MATCHING_SPEC_NOT_FOUND,
    );
  }
  if (spec.status !== JobSpecificationVersionStatus.PUBLISHED) {
    throw new CandidateMatchingError(
      "A published specification is required.",
      MATCHING_SPEC_NOT_PUBLISHED,
    );
  }
  if (spec.jobId !== application.jobId) {
    throw new CandidateMatchingError(
      "Specification does not belong to this application.",
      MATCHING_SPEC_JOB_MISMATCH,
    );
  }

  const selected = await selectEligibleClaims({
    companyId: application.companyId,
    candidateId: application.candidateId,
    applicationId: application.id,
  });
  const intelligenceSnapshotHash = hashIntelligenceSnapshot(selected.snapshotPairs);
  const key: MatchingIdempotencyKey = {
    companyId: application.companyId,
    applicationId: application.id,
    jobSpecificationVersionId: spec.id,
    matcherVersion: MATCHER_VERSION,
    requirementParseVersion: REQUIREMENT_PARSE_VERSION,
    aliasMapVersion: ALIAS_MAP_VERSION,
    intelligenceSnapshotHash,
  };

  const existing = await findCompletedMatchRun(key);
  if (existing) {
    return toSafeRun(existing);
  }

  const running = await findLatestRunningMatchRun(key);
  if (running) {
    const ageMs = Date.now() - running.createdAt.getTime();
    if (ageMs < STALE_MATCH_RUNNING_MS) {
      throw new CandidateMatchingError(
        "Candidate matching is already running.",
        MATCHING_IN_PROGRESS,
      );
    }
    await markMatchRunFailed(
      running.id,
      running.companyId,
      MATCHING_INTERNAL_ERROR,
    );
  }

  const run = await createMatchRun({
    ...key,
    candidateId: application.candidateId,
    jobId: application.jobId,
  });
  logMatchEvent("candidate_matching_started", {
    runId: run.id,
    applicationId: application.id,
    candidateId: application.candidateId,
    jobId: application.jobId,
    specificationVersionId: spec.id,
    companyId: application.companyId,
  });

  try {
    const drafts = computeRequirementMatches({
      spec: {
        primarySkills: spec.primarySkills,
        location: spec.location,
        mustHaveRequirements: spec.mustHaveRequirements,
        niceToHaveRequirements: spec.niceToHaveRequirements,
      },
      claims: selected.claims,
    });

    const completed = await prisma.$transaction(async (tx) => {
      const raced = await findCompletedMatchRun(key, tx);
      if (raced) {
        await markMatchRunFailed(
          run.id,
          application.companyId,
          MATCHING_INTERNAL_ERROR,
          tx,
        );
        return raced;
      }
      await createRequirementMatches(
        {
          companyId: application.companyId,
          runId: run.id,
          rows: drafts,
        },
        tx,
      );
      const updated = await markMatchRunCompleted(
        run.id,
        application.companyId,
        tx,
      );
      if (updated.count !== 1) {
        throw new CandidateMatchingError(
          MATCHING_GENERIC_ERROR,
          MATCHING_INTERNAL_ERROR,
        );
      }
      const stored = await getMatchRunWithRows(run.id, application.companyId, tx);
      if (!stored) {
        throw new CandidateMatchingError(
          MATCHING_GENERIC_ERROR,
          MATCHING_INTERNAL_ERROR,
        );
      }
      return stored;
    });

    logMatchEvent("candidate_matching_completed", {
      runId: completed.id,
      applicationId: application.id,
      candidateId: application.candidateId,
      jobId: application.jobId,
      specificationVersionId: spec.id,
      companyId: application.companyId,
      status: completed.status,
    });
    return toSafeRun(completed);
  } catch (error) {
    await markMatchRunFailed(
      run.id,
      application.companyId,
      error instanceof CandidateMatchingError
        ? error.code
        : MATCHING_INTERNAL_ERROR,
    );
    logMatchEvent("candidate_matching_failed", {
      runId: run.id,
      applicationId: application.id,
      candidateId: application.candidateId,
      jobId: application.jobId,
      specificationVersionId: spec.id,
      companyId: application.companyId,
      status: "FAILED",
      errorCode:
        error instanceof CandidateMatchingError
          ? error.code
          : MATCHING_INTERNAL_ERROR,
    });
    if (error instanceof CandidateMatchingError) {
      throw error;
    }
    throw new CandidateMatchingError(
      MATCHING_GENERIC_ERROR,
      MATCHING_INTERNAL_ERROR,
    );
  }
}

export async function getCandidateMatching(
  candidateIdInput: unknown,
): Promise<CandidateMatchingPageData> {
  await requireMatchingAdmin();
  const candidateId = validateMatchingCandidateId(candidateIdInput);
  const candidate = await findCandidateHandle(candidateId);
  if (!candidate) {
    matchingNotFound();
  }

  const applications = await listApplicationsForCandidateMatching(
    candidate.id,
    candidate.companyId,
  );
  const specs = await listPublishedSpecsForJobs(
    applications.map((application) => application.jobId),
  );
  const specsByJob = new Map<number, typeof specs>();
  for (const spec of specs) {
    const list = specsByJob.get(spec.jobId) ?? [];
    list.push(spec);
    specsByJob.set(spec.jobId, list);
  }

  const runs = await listMatchRunsForCandidate(candidate.id, candidate.companyId);
  return {
    candidateId: candidate.id,
    applications: applications.map((application) => ({
      id: application.id,
      jobId: application.jobId,
      jobTitle: application.job.title,
      publishedSpecs: (specsByJob.get(application.jobId) ?? []).map((spec) => ({
        id: spec.id,
        jobId: spec.jobId,
        versionNumber: spec.versionNumber,
        title: spec.title,
        primarySkills: spec.primarySkills,
        location: spec.location,
      })),
    })),
    runs: runs.map(toSafeRun),
  };
}

export async function runCandidateMatchingForAdmin(
  applicationIdInput: unknown,
  specificationIdInput: unknown,
  browserInput?: unknown,
) {
  await requireMatchingAdmin();
  rejectForbiddenMatchingFields(browserInput);
  const applicationId = validateMatchingApplicationId(applicationIdInput);
  const jobSpecificationVersionId = validateMatchingSpecificationId(
    specificationIdInput,
  );
  return executeRunCandidateMatching({
    applicationId,
    jobSpecificationVersionId,
  });
}

export function isCandidateMatchingActionError(
  error: unknown,
): error is
  | CandidateMatchingError
  | CandidateMatchingValidationError
  | AuthorizationError
  | AuthenticationError {
  return (
    error instanceof CandidateMatchingError ||
    error instanceof CandidateMatchingValidationError ||
    error instanceof AuthorizationError ||
    error instanceof AuthenticationError
  );
}

export function matchingActionErrorMessage(error: unknown) {
  if (error instanceof CandidateMatchingValidationError) {
    return error.message;
  }
  if (error instanceof CandidateMatchingError) {
    if (
      error.code === MATCHING_SPEC_NOT_PUBLISHED ||
      error.code === MATCHING_SPEC_JOB_MISMATCH ||
      error.code === MATCHING_IN_PROGRESS
    ) {
      return error.message;
    }
    if (
      error.code === MATCHING_NOT_FOUND ||
      error.code === MATCHING_SPEC_NOT_FOUND
    ) {
      return "Resource not found.";
    }
    return MATCHING_GENERIC_ERROR;
  }
  return "Resource not found.";
}
