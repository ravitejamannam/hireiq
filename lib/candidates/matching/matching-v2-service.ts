import {
  CandidateClaimType,
  JobRequirementCategory,
  JobSpecificationVersionStatus,
  PortalRole,
} from "@prisma/client";

import {
  AuthenticationError,
  AuthorizationError,
  requireAdmin,
} from "@/lib/auth/authorization";
import { executeRunDeterministicIntelligence } from "@/lib/candidates/intelligence/deterministic-intelligence-service";
import {
  computeRequirementAssessments,
  explainAssessment,
  hashIntelligenceSnapshot,
} from "@/lib/candidates/matching/matching-engine-v2";
import {
  MATCHER_V2_GENERIC_ERROR,
  MATCHER_V2_IN_PROGRESS,
  MATCHER_V2_INTERNAL_ERROR,
  MATCHER_V2_NO_JOB_INTEL,
  MATCHER_V2_NOT_FOUND,
  MatcherV2Error,
} from "@/lib/candidates/matching/matching-v2-errors";
import type {
  MatcherV2Claim,
  RequirementExplanationPageData,
  SafeRequirementAssessment,
  SafeRequirementAssessmentRun,
} from "@/lib/candidates/matching/matching-v2-types";
import { MATCHER_V2_VERSION } from "@/lib/candidates/matching/matching-v2-versions";
import { executeRunJobIntelligence } from "@/lib/jobs/intelligence/job-intelligence-service";
import { ONTOLOGY_VERSION } from "@/lib/ontology/skill-alias-catalog";
import { resolveSkillAlias } from "@/lib/ontology/skill-alias";
import { prisma } from "@/lib/prisma";
import { getApplicationForMatching } from "@/lib/repositories/candidate-matching-repository";
import {
  findLatestCompletedJobIntelligenceForSpec,
  getPublishedSpecForJobIntelligence,
  listPublishedSpecsForJob,
} from "@/lib/repositories/job-intelligence-repository";
import {
  createAssessmentRun,
  createRequirementAssessments,
  findCompletedAssessmentRun,
  findLatestRunningAssessmentRun,
  getAssessmentRunWithRows,
  listApplicationsForJobExplanation,
  listCompletedClaimsForEvidence,
  listEligibleEvidenceForCandidate,
  listLatestAssessmentRunsForJob,
  markAssessmentRunCompleted,
  markAssessmentRunFailed,
  type MatcherV2IdempotencyKey,
  type RequirementAssessmentRunRow,
} from "@/lib/repositories/requirement-assessment-repository";
import {
  RequirementAssessmentValidationError,
  rejectForbiddenAssessmentFields,
  validateAssessmentJobId,
  validateAssessmentSpecificationId,
} from "@/lib/validation/requirement-assessment-validation";

const STALE_MS = 60_000;

function notFound(): never {
  throw new MatcherV2Error("Resource not found.", MATCHER_V2_NOT_FOUND);
}

export function assertCanManageMatcherV2(role: PortalRole) {
  if (role !== PortalRole.ADMIN) {
    throw new AuthorizationError("Resource not found.");
  }
}

async function requireMatcherV2Admin() {
  const user = await requireAdmin();
  assertCanManageMatcherV2(user.role);
  return user;
}

function toSafeAssessments(
  run: RequirementAssessmentRunRow,
  requirements: Array<{
    id: number;
    sourceText: string;
    category: JobRequirementCategory;
  }>,
): SafeRequirementAssessment[] {
  const byId = new Map(
    requirements.map((requirement) => [requirement.id, requirement] as const),
  );
  return run.assessments.map((row) => {
    const requirement = byId.get(row.jobRequirementId);
    const explained = explainAssessment({
      supportState: row.supportState,
      reasonCode: row.reasonCode,
      sourceText: requirement?.sourceText ?? "this requirement",
      category: requirement?.category ?? JobRequirementCategory.AMBIGUOUS,
    });
    return {
      ...row,
      why: explained.why,
      gap: explained.gap,
      uncertainty: explained.uncertainty,
      evidenceSummary:
        row.evidenceId != null
          ? `Cited evidence #${row.evidenceId}${row.claimId != null ? `, claim #${row.claimId}` : ""}`
          : null,
    };
  });
}

function toSafeRun(
  row: RequirementAssessmentRunRow,
  requirements: Array<{
    id: number;
    sourceText: string;
    category: JobRequirementCategory;
  }>,
): SafeRequirementAssessmentRun {
  return {
    id: row.id,
    companyId: row.companyId,
    applicationId: row.applicationId,
    candidateId: row.candidateId,
    jobId: row.jobId,
    jobSpecificationVersionId: row.jobSpecificationVersionId,
    jobIntelligenceRunId: row.jobIntelligenceRunId,
    status: row.status,
    matcherVersion: row.matcherVersion,
    ontologyVersion: row.ontologyVersion,
    intelligenceSnapshotHash: row.intelligenceSnapshotHash,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    errorCode: row.errorCode,
    assessments: toSafeAssessments(row, requirements),
  };
}

async function selectMatcherV2Claims(input: {
  companyId: number;
  candidateId: number;
  applicationId: number;
}) {
  const evidenceRows = await listEligibleEvidenceForCandidate(input);
  for (const evidence of evidenceRows) {
    if (
      evidence.companyId !== input.companyId ||
      evidence.candidateId !== input.candidateId
    ) {
      continue;
    }
    await executeRunDeterministicIntelligence({
      candidateId: evidence.candidateId,
      evidenceId: evidence.id,
    });
  }

  const claims = await listCompletedClaimsForEvidence(
    evidenceRows.map((row) => row.id),
    input.companyId,
    input.candidateId,
  );

  const mapped: MatcherV2Claim[] = [];
  const snapshotPairs: Array<{ evidenceId: number; runId: number }> = [];
  const seenSnap = new Set<string>();

  for (const claim of claims) {
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
    const snapKey = `${claim.evidenceId}:${claim.runId}`;
    if (!seenSnap.has(snapKey)) {
      seenSnap.add(snapKey);
      snapshotPairs.push({ evidenceId: claim.evidenceId, runId: claim.runId });
    }
    mapped.push({
      id: claim.id,
      evidenceId: claim.evidenceId,
      runId: claim.runId,
      claimType: claim.claimType,
      normalizedValue: normalized,
      polarity: claim.polarity,
      viaAlias: Boolean(resolveSkillAlias(claim.value)?.viaAlias),
    });
  }

  return {
    claims: mapped,
    snapshotHash: hashIntelligenceSnapshot(snapshotPairs),
  };
}

export async function executeRunMatcherV2(input: {
  applicationId: number;
  jobSpecificationVersionId: number;
}): Promise<SafeRequirementAssessmentRun> {
  const application = await getApplicationForMatching(input.applicationId);
  if (!application) {
    notFound();
  }

  const spec = await getPublishedSpecForJobIntelligence(
    input.jobSpecificationVersionId,
  );
  if (!spec || spec.status !== JobSpecificationVersionStatus.PUBLISHED) {
    notFound();
  }
  if (spec.jobId !== application.jobId) {
    notFound();
  }

  const intel = await executeRunJobIntelligence({
    jobId: application.jobId,
    jobSpecificationVersionId: spec.id,
  });

  const selected = await selectMatcherV2Claims({
    companyId: application.companyId,
    candidateId: application.candidateId,
    applicationId: application.id,
  });

  const key: MatcherV2IdempotencyKey = {
    companyId: application.companyId,
    applicationId: application.id,
    jobSpecificationVersionId: spec.id,
    jobIntelligenceRunId: intel.id,
    matcherVersion: MATCHER_V2_VERSION,
    ontologyVersion: ONTOLOGY_VERSION,
    intelligenceSnapshotHash: selected.snapshotHash,
  };

  const existing = await findCompletedAssessmentRun(key);
  if (existing) {
    return toSafeRun(existing, intel.requirements);
  }

  const running = await findLatestRunningAssessmentRun(key);
  if (running) {
    if (Date.now() - running.createdAt.getTime() < STALE_MS) {
      throw new MatcherV2Error(
        "Requirement assessment is already running.",
        MATCHER_V2_IN_PROGRESS,
      );
    }
    await markAssessmentRunFailed(
      running.id,
      running.companyId,
      MATCHER_V2_INTERNAL_ERROR,
    );
  }

  const run = await createAssessmentRun({
    ...key,
    candidateId: application.candidateId,
    jobId: application.jobId,
  });

  try {
    const drafts = computeRequirementAssessments({
      requirements: intel.requirements.map((requirement) => ({
        id: requirement.id,
        stableKey: requirement.stableKey,
        sourceField: requirement.sourceField,
        sourceText: requirement.sourceText,
        category: requirement.category,
        normalizedValue: requirement.normalizedValue,
        skillCanonicalKey: requirement.skillConceptId
          ? requirement.normalizedValue
          : null,
        uncertainty: requirement.uncertainty,
      })),
      claims: selected.claims,
    });

    const completed = await prisma.$transaction(async (tx) => {
      const raced = await findCompletedAssessmentRun(key, tx);
      if (raced) {
        await markAssessmentRunFailed(
          run.id,
          key.companyId,
          MATCHER_V2_INTERNAL_ERROR,
          tx,
        );
        return raced;
      }
      await createRequirementAssessments(
        {
          companyId: key.companyId,
          runId: run.id,
          applicationId: application.id,
          candidateId: application.candidateId,
          rows: drafts,
        },
        tx,
      );
      const updated = await markAssessmentRunCompleted(run.id, key.companyId, tx);
      if (updated.count !== 1) {
        throw new MatcherV2Error(
          MATCHER_V2_GENERIC_ERROR,
          MATCHER_V2_INTERNAL_ERROR,
        );
      }
      const stored = await getAssessmentRunWithRows(run.id, key.companyId, tx);
      if (!stored) {
        throw new MatcherV2Error(
          MATCHER_V2_GENERIC_ERROR,
          MATCHER_V2_INTERNAL_ERROR,
        );
      }
      return stored;
    });
    return toSafeRun(completed, intel.requirements);
  } catch (error) {
    await markAssessmentRunFailed(
      run.id,
      key.companyId,
      error instanceof MatcherV2Error ? error.code : MATCHER_V2_INTERNAL_ERROR,
    );
    if (error instanceof MatcherV2Error) {
      throw error;
    }
    throw new MatcherV2Error(MATCHER_V2_GENERIC_ERROR, MATCHER_V2_INTERNAL_ERROR);
  }
}

export async function getRequirementExplanation(
  jobIdInput: unknown,
): Promise<RequirementExplanationPageData> {
  await requireMatcherV2Admin();
  const jobId = validateAssessmentJobId(jobIdInput);
  const job = await prisma.job.findFirst({
    where: { id: jobId },
    select: { id: true, companyId: true, currentPublishedSpecificationVersionId: true },
  });
  if (!job) {
    notFound();
  }

  const specs = await listPublishedSpecsForJob(job.id, job.companyId);
  const specId = job.currentPublishedSpecificationVersionId ?? specs[0]?.id ?? null;
  const intel = specId
    ? await findLatestCompletedJobIntelligenceForSpec(specId, job.companyId)
    : null;
  const applications = await listApplicationsForJobExplanation(job.id, job.companyId);
  const runs = specId
    ? await listLatestAssessmentRunsForJob(job.id, job.companyId, specId)
    : [];
  const latestByApp = new Map<number, (typeof runs)[number]>();
  for (const run of runs) {
    if (!latestByApp.has(run.applicationId)) {
      latestByApp.set(run.applicationId, run);
    }
  }

  const requirements = intel?.requirements ?? [];

  return {
    jobId: job.id,
    jobIntelligence: intel
      ? {
          runId: intel.id,
          jobSpecificationVersionId: intel.jobSpecificationVersionId,
          extractorVersion: intel.extractorVersion,
          requirements: intel.requirements.map((requirement) => ({
            id: requirement.id,
            sourceField: requirement.sourceField,
            sourceText: requirement.sourceText,
            category: requirement.category,
            uncertainty: requirement.uncertainty,
            normalizedValue: requirement.normalizedValue,
          })),
        }
      : null,
    publishedSpecs: specs,
    applications: applications.map((application) => {
      const run = latestByApp.get(application.id) ?? null;
      return {
        applicationId: application.id,
        candidateId: application.candidateId,
        candidateName: application.candidate.name,
        run: run ? toSafeRun(run, requirements) : null,
      };
    }),
  };
}

export async function runRequirementExplanationForJobAdmin(
  jobIdInput: unknown,
  specificationIdInput: unknown,
  browserInput?: unknown,
) {
  await requireMatcherV2Admin();
  rejectForbiddenAssessmentFields(browserInput);
  const jobId = validateAssessmentJobId(jobIdInput);
  const specificationId = validateAssessmentSpecificationId(specificationIdInput);

  const applications = await prisma.application.findMany({
    where: { jobId },
    select: { id: true, companyId: true, jobId: true },
    orderBy: { id: "asc" },
  });
  const job = applications[0]
    ? { companyId: applications[0].companyId }
    : await prisma.job.findFirst({
        where: { id: jobId },
        select: { companyId: true },
      });
  if (!job) {
    notFound();
  }
  if (applications.some((application) => application.companyId !== job.companyId)) {
    notFound();
  }

  await executeRunJobIntelligence({
    jobId,
    jobSpecificationVersionId: specificationId,
  });

  for (const application of applications) {
    await executeRunMatcherV2({
      applicationId: application.id,
      jobSpecificationVersionId: specificationId,
    });
  }

  return getRequirementExplanation(jobId);
}

export function isMatcherV2ActionError(
  error: unknown,
): error is
  | MatcherV2Error
  | RequirementAssessmentValidationError
  | AuthorizationError
  | AuthenticationError {
  return (
    error instanceof MatcherV2Error ||
    error instanceof RequirementAssessmentValidationError ||
    error instanceof AuthorizationError ||
    error instanceof AuthenticationError
  );
}

export function matcherV2ActionErrorMessage(error: unknown) {
  if (error instanceof RequirementAssessmentValidationError) {
    return error.message;
  }
  if (error instanceof MatcherV2Error) {
    if (
      error.code === MATCHER_V2_IN_PROGRESS ||
      error.code === MATCHER_V2_NO_JOB_INTEL
    ) {
      return error.message;
    }
    if (error.code === MATCHER_V2_NOT_FOUND) {
      return "Resource not found.";
    }
    return MATCHER_V2_GENERIC_ERROR;
  }
  return "Resource not found.";
}
