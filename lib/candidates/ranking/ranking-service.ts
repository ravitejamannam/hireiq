import {
  JobSpecificationVersionStatus,
  PortalRole,
} from "@prisma/client";

import {
  AuthenticationError,
  AuthorizationError,
  requireAdmin,
} from "@/lib/auth/authorization";
import {
  CandidateRankingError,
  RANKING_GENERIC_ERROR,
  RANKING_IN_PROGRESS,
  RANKING_INTERNAL_ERROR,
  RANKING_NO_MATCH_RUNS,
  RANKING_NOT_FOUND,
  RANKING_SPEC_JOB_MISMATCH,
  RANKING_SPEC_NOT_FOUND,
  RANKING_SPEC_NOT_PUBLISHED,
} from "@/lib/candidates/ranking/ranking-errors";
import {
  computeJobRanking,
  hashApplicationSet,
} from "@/lib/candidates/ranking/ranking-engine";
import type {
  JobRankingPageData,
  RankingApplicationInput,
  SafeJobRankingResult,
  SafeJobRankingRun,
} from "@/lib/candidates/ranking/ranking-types";
import {
  ALIAS_MAP_VERSION,
  MATCHER_VERSION,
  RANKING_POLICY_VERSION,
  REQUIREMENT_PARSE_VERSION,
  STALE_RANKING_RUNNING_MS,
} from "@/lib/candidates/ranking/ranking-versions";
import { prisma } from "@/lib/prisma";
import {
  createRankingResults,
  createRankingRun,
  findCompletedRankingRun,
  findLatestRunningRankingRun,
  getJobForRanking,
  getRankingRunWithRows,
  getSpecificationForRanking,
  listApplicationsForJobRanking,
  listCompletedMatchRunsForRanking,
  listPublishedSpecsForJob,
  listRankingRunsForJob,
  markRankingRunCompleted,
  markRankingRunFailed,
  type JobRankingRunRow,
  type RankingIdempotencyKey,
  type RankingMatchRunRow,
} from "@/lib/repositories/candidate-ranking-repository";
import {
  CandidateRankingValidationError,
  rejectForbiddenRankingFields,
  validateRankingJobId,
  validateRankingSpecificationId,
} from "@/lib/validation/candidate-ranking-validation";

function rankingNotFound(): never {
  throw new CandidateRankingError("Resource not found.", RANKING_NOT_FOUND);
}

export function assertCanManageCandidateRanking(role: PortalRole) {
  if (role !== PortalRole.ADMIN) {
    throw new AuthorizationError("Resource not found.");
  }
}

async function requireRankingAdmin() {
  const user = await requireAdmin();
  assertCanManageCandidateRanking(user.role);
  return user;
}

function toSafeResult(
  row: JobRankingRunRow["results"][number],
): SafeJobRankingResult {
  return {
    id: row.id,
    companyId: row.companyId,
    runId: row.runId,
    applicationId: row.applicationId,
    candidateId: row.candidateId,
    candidateMatchRunId: row.candidateMatchRunId,
    rank: row.rank,
    satisfiedSkillCount: row.satisfiedSkillCount,
    unknownSkillCount: row.unknownSkillCount,
    coverageStatus: row.coverageStatus,
    createdAt: row.createdAt,
  };
}

function toSafeRun(row: JobRankingRunRow): SafeJobRankingRun {
  return {
    id: row.id,
    companyId: row.companyId,
    jobId: row.jobId,
    jobSpecificationVersionId: row.jobSpecificationVersionId,
    status: row.status,
    rankingPolicyVersion: row.rankingPolicyVersion,
    matcherVersion: row.matcherVersion,
    requirementParseVersion: row.requirementParseVersion,
    aliasMapVersion: row.aliasMapVersion,
    applicationSetHash: row.applicationSetHash,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    errorCode: row.errorCode,
    durationMs: row.durationMs,
    rankedCount: row.rankedCount,
    unrankedCount: row.unrankedCount,
    results: row.results.map(toSafeResult),
  };
}

function logRankingEvent(event: string, payload: Record<string, unknown>) {
  console.info(`[rank] ${event}`, payload);
}

function selectLatestMatchRun(
  runs: RankingMatchRunRow[],
): RankingMatchRunRow | null {
  let selected: RankingMatchRunRow | null = null;
  for (const run of runs) {
    if (!selected) {
      selected = run;
      continue;
    }
    const selectedCompleted = selected.completedAt?.getTime() ?? 0;
    const runCompleted = run.completedAt?.getTime() ?? 0;
    if (runCompleted !== selectedCompleted) {
      if (runCompleted > selectedCompleted) {
        selected = run;
      }
      continue;
    }
    if (run.id > selected.id) {
      selected = run;
    }
  }
  return selected;
}

export async function executeRunJobRanking(input: {
  jobId: number;
  jobSpecificationVersionId: number;
}): Promise<SafeJobRankingRun> {
  const startedAt = Date.now();
  const job = await getJobForRanking(input.jobId);
  if (!job) {
    rankingNotFound();
  }

  const spec = await getSpecificationForRanking(input.jobSpecificationVersionId);
  if (!spec) {
    throw new CandidateRankingError(
      "Specification not found.",
      RANKING_SPEC_NOT_FOUND,
    );
  }
  if (spec.status !== JobSpecificationVersionStatus.PUBLISHED) {
    throw new CandidateRankingError(
      "A published specification is required.",
      RANKING_SPEC_NOT_PUBLISHED,
    );
  }
  if (spec.jobId !== job.id) {
    throw new CandidateRankingError(
      "Specification does not belong to this job.",
      RANKING_SPEC_JOB_MISMATCH,
    );
  }

  const applications = await listApplicationsForJobRanking(job.id, job.companyId);
  const matchRuns = await listCompletedMatchRunsForRanking({
    companyId: job.companyId,
    jobId: job.id,
    jobSpecificationVersionId: spec.id,
    matcherVersion: MATCHER_VERSION,
    requirementParseVersion: REQUIREMENT_PARSE_VERSION,
    aliasMapVersion: ALIAS_MAP_VERSION,
  });

  const runsByApplication = new Map<number, RankingMatchRunRow[]>();
  for (const run of matchRuns) {
    if (
      run.companyId !== job.companyId ||
      run.jobId !== job.id ||
      run.jobSpecificationVersionId !== spec.id
    ) {
      continue;
    }
    const list = runsByApplication.get(run.applicationId) ?? [];
    list.push(run);
    runsByApplication.set(run.applicationId, list);
  }

  const rankingInputs: RankingApplicationInput[] = [];
  for (const application of applications) {
    if (
      application.companyId !== job.companyId ||
      application.jobId !== job.id ||
      application.job.companyId !== job.companyId ||
      application.candidate.companyId !== job.companyId ||
      application.candidate.id !== application.candidateId
    ) {
      rankingNotFound();
    }
    const selected = selectLatestMatchRun(
      runsByApplication.get(application.id) ?? [],
    );
    if (
      selected &&
      (selected.applicationId !== application.id ||
        selected.candidateId !== application.candidateId ||
        selected.companyId !== job.companyId)
    ) {
      rankingNotFound();
    }
    rankingInputs.push({
      applicationId: application.id,
      candidateId: application.candidateId,
      candidateMatchRunId: selected?.id ?? null,
      requirementRows: selected?.requirementMatches ?? [],
    });
  }

  const applicationSetHash = hashApplicationSet(
    rankingInputs.map((row) => ({
      applicationId: row.applicationId,
      candidateMatchRunId: row.candidateMatchRunId,
    })),
  );
  const key: RankingIdempotencyKey = {
    companyId: job.companyId,
    jobId: job.id,
    jobSpecificationVersionId: spec.id,
    rankingPolicyVersion: RANKING_POLICY_VERSION,
    matcherVersion: MATCHER_VERSION,
    requirementParseVersion: REQUIREMENT_PARSE_VERSION,
    aliasMapVersion: ALIAS_MAP_VERSION,
    applicationSetHash,
  };

  const existing = await findCompletedRankingRun(key);
  if (existing) {
    const staleRunning = await findLatestRunningRankingRun(key);
    if (staleRunning) {
      const ageMs = Date.now() - staleRunning.createdAt.getTime();
      if (ageMs >= STALE_RANKING_RUNNING_MS) {
        await markRankingRunFailed(
          staleRunning.id,
          staleRunning.companyId,
          RANKING_INTERNAL_ERROR,
        );
      }
    }
    return toSafeRun(existing);
  }

  const running = await findLatestRunningRankingRun(key);
  if (running) {
    const ageMs = Date.now() - running.createdAt.getTime();
    if (ageMs < STALE_RANKING_RUNNING_MS) {
      throw new CandidateRankingError(
        "Evidence coverage ranking is already running.",
        RANKING_IN_PROGRESS,
      );
    }
    await markRankingRunFailed(
      running.id,
      running.companyId,
      RANKING_INTERNAL_ERROR,
    );
  }

  const run = await createRankingRun(key);
  logRankingEvent("job_ranking_started", {
    runId: run.id,
    jobId: job.id,
    specificationVersionId: spec.id,
    companyId: job.companyId,
  });

  try {
    const computation = computeJobRanking(rankingInputs);
    if (computation.kind === "no_match_runs") {
      await markRankingRunFailed(run.id, job.companyId, RANKING_NO_MATCH_RUNS);
      logRankingEvent("job_ranking_failed", {
        runId: run.id,
        jobId: job.id,
        specificationVersionId: spec.id,
        companyId: job.companyId,
        status: "FAILED",
        errorCode: RANKING_NO_MATCH_RUNS,
      });
      throw new CandidateRankingError(
        "No completed matching runs are available for this specification.",
        RANKING_NO_MATCH_RUNS,
      );
    }

    const completed = await prisma.$transaction(async (tx) => {
      const raced = await findCompletedRankingRun(key, tx);
      if (raced) {
        await markRankingRunFailed(
          run.id,
          job.companyId,
          RANKING_INTERNAL_ERROR,
          tx,
        );
        return raced;
      }
      await createRankingResults(
        {
          companyId: job.companyId,
          runId: run.id,
          rows: computation.results,
        },
        tx,
      );
      const updated = await markRankingRunCompleted(
        {
          runId: run.id,
          companyId: job.companyId,
          rankedCount: computation.rankedCount,
          unrankedCount: computation.unrankedCount,
          durationMs: Date.now() - startedAt,
        },
        tx,
      );
      if (updated.count !== 1) {
        throw new CandidateRankingError(
          RANKING_GENERIC_ERROR,
          RANKING_INTERNAL_ERROR,
        );
      }
      const stored = await getRankingRunWithRows(run.id, job.companyId, tx);
      if (!stored) {
        throw new CandidateRankingError(
          RANKING_GENERIC_ERROR,
          RANKING_INTERNAL_ERROR,
        );
      }
      return stored;
    });

    logRankingEvent("job_ranking_completed", {
      runId: completed.id,
      jobId: job.id,
      specificationVersionId: spec.id,
      companyId: job.companyId,
      status: completed.status,
      rankedCount: completed.rankedCount,
      unrankedCount: completed.unrankedCount,
    });
    return toSafeRun(completed);
  } catch (error) {
    if (
      error instanceof CandidateRankingError &&
      error.code === RANKING_NO_MATCH_RUNS
    ) {
      throw error;
    }
    await markRankingRunFailed(
      run.id,
      job.companyId,
      error instanceof CandidateRankingError
        ? error.code
        : RANKING_INTERNAL_ERROR,
    );
    logRankingEvent("job_ranking_failed", {
      runId: run.id,
      jobId: job.id,
      specificationVersionId: spec.id,
      companyId: job.companyId,
      status: "FAILED",
      errorCode:
        error instanceof CandidateRankingError
          ? error.code
          : RANKING_INTERNAL_ERROR,
    });
    if (error instanceof CandidateRankingError) {
      throw error;
    }
    throw new CandidateRankingError(
      RANKING_GENERIC_ERROR,
      RANKING_INTERNAL_ERROR,
    );
  }
}

export async function getJobRanking(
  jobIdInput: unknown,
): Promise<JobRankingPageData> {
  await requireRankingAdmin();
  const jobId = validateRankingJobId(jobIdInput);
  const job = await getJobForRanking(jobId);
  if (!job) {
    rankingNotFound();
  }

  const [specs, runs] = await Promise.all([
    listPublishedSpecsForJob(job.id),
    listRankingRunsForJob(job.id, job.companyId),
  ]);

  return {
    jobId: job.id,
    companyId: job.companyId,
    publishedSpecs: specs.map((spec) => ({
      id: spec.id,
      jobId: spec.jobId,
      versionNumber: spec.versionNumber,
      title: spec.title,
      primarySkills: spec.primarySkills,
      location: spec.location,
    })),
    runs: runs.map(toSafeRun),
  };
}

export async function runJobRankingForAdmin(
  jobIdInput: unknown,
  specificationIdInput: unknown,
  browserInput?: unknown,
) {
  await requireRankingAdmin();
  rejectForbiddenRankingFields(browserInput);
  const jobId = validateRankingJobId(jobIdInput);
  const jobSpecificationVersionId = validateRankingSpecificationId(
    specificationIdInput,
  );
  return executeRunJobRanking({
    jobId,
    jobSpecificationVersionId,
  });
}

export function isCandidateRankingActionError(
  error: unknown,
): error is
  | CandidateRankingError
  | CandidateRankingValidationError
  | AuthorizationError
  | AuthenticationError {
  return (
    error instanceof CandidateRankingError ||
    error instanceof CandidateRankingValidationError ||
    error instanceof AuthorizationError ||
    error instanceof AuthenticationError
  );
}

export function rankingActionErrorMessage(error: unknown) {
  if (error instanceof CandidateRankingValidationError) {
    return error.message;
  }
  if (error instanceof CandidateRankingError) {
    if (
      error.code === RANKING_SPEC_NOT_PUBLISHED ||
      error.code === RANKING_SPEC_JOB_MISMATCH ||
      error.code === RANKING_IN_PROGRESS ||
      error.code === RANKING_NO_MATCH_RUNS
    ) {
      return error.message;
    }
    if (
      error.code === RANKING_NOT_FOUND ||
      error.code === RANKING_SPEC_NOT_FOUND
    ) {
      return "Resource not found.";
    }
    return RANKING_GENERIC_ERROR;
  }
  return "Resource not found.";
}
