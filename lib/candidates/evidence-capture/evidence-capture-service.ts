import {
  CandidateEvidenceOrigin,
  CandidateEvidenceSourceType,
  PortalRole,

} from "@prisma/client";

import {
  AuthenticationError,
  AuthorizationError,
  requireAdmin,
} from "@/lib/auth/authorization";
import {
  CAPTURE_APPLICATION_NOT_FOUND,
  CAPTURE_GENERIC_ERROR,
  CAPTURE_INTERNAL_ERROR,
  CAPTURE_JOB_NOT_FOUND,
  CAPTURE_WRONG_TENANT,
  EvidenceCaptureError,
} from "@/lib/candidates/evidence-capture/evidence-capture-errors";
import {
  CAPTURE_SKIP_REASON,
  emptySkipReasons,
  hasEvidenceLikeText,
  incrementSkipReason,
  isHostedApplyCoverLetterEvidence,
} from "@/lib/candidates/evidence-capture/evidence-capture-engine";
import type {
  JobEvidenceCapturePageData,
  JobEvidenceCaptureResult,
  RecruiterEvidenceCaptureResult,
} from "@/lib/candidates/evidence-capture/evidence-capture-types";
import { CAPTURE_POLICY_VERSION } from "@/lib/candidates/evidence-capture/evidence-capture-versions";
import { hashEvidenceInlineText } from "@/lib/candidates/evidence/evidence-hash";
import { executeCreateEvidence } from "@/lib/candidates/evidence/evidence-service";
import { findEvidenceByHostedApplySubmission } from "@/lib/repositories/candidate-evidence-repository";
import {
  countEvidenceByApplicationForJob,
  findRecruiterEvidenceByContentHash,
  getApplicationForCaptureInJob,
  getJobForCapture,
  listApplicationsForJobCapture,
  listJobHostedApplyCaptureSources,
} from "@/lib/repositories/candidate-evidence-capture-repository";
import {
  EvidenceCaptureValidationError,
  rejectForbiddenCaptureFields,
  validateCaptureApplicationId,
  validateCaptureJobId,
  validateRecruiterEvidenceText,
} from "@/lib/validation/candidate-evidence-capture-validation";
import { getPrismaErrorCode, isPrismaKnownRequestError } from "@/lib/prisma-error";

function captureNotFound(code: string): never {
  throw new EvidenceCaptureError("Resource not found.", code);
}

export function assertCanManageEvidenceCapture(role: PortalRole) {
  if (role !== PortalRole.ADMIN) {
    throw new AuthorizationError("Resource not found.");
  }
}

async function requireCaptureAdmin() {
  const user = await requireAdmin();
  assertCanManageEvidenceCapture(user.role);
  return user;
}

function logCaptureEvent(event: string, payload: Record<string, unknown>) {
  console.info(`[evidence-capture] ${event}`, payload);
}

function toRecruiterResult(
  row: {
    id: number;
    companyId: number;
    candidateId: number;
    applicationId: number | null;
    sourceType: CandidateEvidenceSourceType;
    contentSha256: string | null;
  },
  reused: boolean,
): RecruiterEvidenceCaptureResult {
  if (!row.applicationId || !row.contentSha256) {
    throw new EvidenceCaptureError(
      CAPTURE_GENERIC_ERROR,
      CAPTURE_INTERNAL_ERROR,
    );
  }

  return {
    evidenceId: row.id,
    candidateId: row.candidateId,
    applicationId: row.applicationId,
    companyId: row.companyId,
    sourceType: row.sourceType,
    contentSha256: row.contentSha256,
    reused,
  };
}

export async function executeCaptureJobTextualEvidence(input: {
  jobId: number;
}): Promise<JobEvidenceCaptureResult> {
  const startedAt = Date.now();
  const job = await getJobForCapture(input.jobId);
  if (!job) {
    captureNotFound(CAPTURE_JOB_NOT_FOUND);
  }

  const [applications, hostedSources] = await Promise.all([
    listApplicationsForJobCapture(job.id, job.companyId),
    listJobHostedApplyCaptureSources(job.id, job.companyId),
  ]);

  const reasons = emptySkipReasons();
  let captured = 0;
  let skipped = 0;
  const processedApplicationIds = new Set<number>();

  function skip(reason: keyof typeof CAPTURE_SKIP_REASON) {
    skipped += 1;
    incrementSkipReason(reasons, CAPTURE_SKIP_REASON[reason]);
  }

  for (const source of hostedSources) {
    if (
      source.companyId !== job.companyId ||
      !source.applicationId ||
      !source.candidateId ||
      !source.hostedApplySubmissionId ||
      !source.hostedApplySubmission ||
      !source.application
    ) {
      skip("UNSUPPORTED_SOURCE");
      continue;
    }
    if (
      source.application.companyId !== job.companyId ||
      source.application.jobId !== job.id ||
      source.hostedApplySubmission.companyId !== job.companyId ||
      source.hostedApplySubmission.jobId !== job.id ||
      source.application.candidateId !== source.candidateId
    ) {
      skip("UNSUPPORTED_SOURCE");
      continue;
    }

    processedApplicationIds.add(source.applicationId);

    if (!isHostedApplyCoverLetterEvidence(source.hostedApplySubmission.coverLetter)) {
      skip("NO_TEXT");
      continue;
    }

    const existing = await findEvidenceByHostedApplySubmission(
      source.hostedApplySubmissionId,
      job.companyId,
    );
    if (existing) {
      skip("ALREADY_EXISTS");
      continue;
    }

    try {
      await executeCreateEvidence({
        candidateId: source.candidateId,
        applicationId: source.applicationId,
        sourceType: CandidateEvidenceSourceType.HOSTED_APPLY_SUBMISSION,
        origin: CandidateEvidenceOrigin.CANDIDATE_PROVIDED,
        ingestionEventId: source.id,
        hostedApplySubmissionId: source.hostedApplySubmissionId,
        actorUserId: null,
        inlineText: source.hostedApplySubmission.coverLetter,
        createdAt: source.hostedApplySubmission.createdAt,
      });
    } catch (error) {
      if (
        isPrismaKnownRequestError(error)
      ) {
        throw new EvidenceCaptureError(
          CAPTURE_GENERIC_ERROR,
          CAPTURE_INTERNAL_ERROR,
        );
      }
      throw error;
    }
    captured += 1;
  }

  for (const application of applications) {
    if (
      application.companyId !== job.companyId ||
      application.jobId !== job.id
    ) {
      throw new EvidenceCaptureError(
        "Resource not found.",
        CAPTURE_WRONG_TENANT,
      );
    }
    if (processedApplicationIds.has(application.id)) {
      continue;
    }
    skip("NO_TEXT");
  }

  const result: JobEvidenceCaptureResult = {
    jobId: job.id,
    companyId: job.companyId,
    captured,
    skipped,
    reasons,
  };

  logCaptureEvent("job_capture_completed", {
    jobId: job.id,
    companyId: job.companyId,
    captured,
    skipped,
    reasons,
    capturePolicyVersion: CAPTURE_POLICY_VERSION,
    durationMs: Date.now() - startedAt,
  });

  return result;
}

export async function executeAttachRecruiterTextualEvidence(input: {
  jobId: number;
  applicationId: number;
  inlineText: string;
  actorUserId: number | null;
}): Promise<RecruiterEvidenceCaptureResult> {
  const job = await getJobForCapture(input.jobId);
  if (!job) {
    captureNotFound(CAPTURE_JOB_NOT_FOUND);
  }

  const application = await getApplicationForCaptureInJob(
    input.applicationId,
    job.id,
    job.companyId,
  );
  if (!application) {
    captureNotFound(CAPTURE_APPLICATION_NOT_FOUND);
  }
  if (
    application.companyId !== job.companyId ||
    application.jobId !== job.id
  ) {
    throw new EvidenceCaptureError(
      "Resource not found.",
      CAPTURE_WRONG_TENANT,
    );
  }

  const inlineText = validateRecruiterEvidenceText(input.inlineText);
  const contentSha256 = hashEvidenceInlineText(inlineText);

  const existing = await findRecruiterEvidenceByContentHash(
    job.companyId,
    application.id,
    contentSha256,
  );
  if (existing) {
    logCaptureEvent("recruiter_text_reused", {
      jobId: job.id,
      companyId: job.companyId,
      applicationId: application.id,
      evidenceId: existing.id,
      sourceType: CandidateEvidenceSourceType.RECRUITER_ENTERED_TEXT,
    });
    return toRecruiterResult(existing, true);
  }

  try {
    const created = await executeCreateEvidence({
      candidateId: application.candidateId,
      applicationId: application.id,
      sourceType: CandidateEvidenceSourceType.RECRUITER_ENTERED_TEXT,
      origin: CandidateEvidenceOrigin.RECRUITER_ENTERED,
      ingestionEventId: null,
      hostedApplySubmissionId: null,
      actorUserId: input.actorUserId,
      inlineText,
    });

    logCaptureEvent("recruiter_text_captured", {
      jobId: job.id,
      companyId: job.companyId,
      applicationId: application.id,
      evidenceId: created.id,
      sourceType: created.sourceType,
    });

    return toRecruiterResult(created, false);
  } catch (error) {
    if (
      getPrismaErrorCode(error) === "P2002"
    ) {
      const raced = await findRecruiterEvidenceByContentHash(
        job.companyId,
        application.id,
        contentSha256,
      );
      if (raced) {
        return toRecruiterResult(raced, true);
      }
    }
    throw error;
  }
}

export async function getJobEvidenceCapture(
  jobIdInput: unknown,
): Promise<JobEvidenceCapturePageData> {
  await requireCaptureAdmin();
  const jobId = validateCaptureJobId(jobIdInput);
  const job = await getJobForCapture(jobId);
  if (!job) {
    captureNotFound(CAPTURE_JOB_NOT_FOUND);
  }

  const applications = await listApplicationsForJobCapture(
    job.id,
    job.companyId,
  );
  const hostedSources = await listJobHostedApplyCaptureSources(
    job.id,
    job.companyId,
  );
  const counts = await countEvidenceByApplicationForJob(
    job.id,
    job.companyId,
    applications.map((row) => row.id),
  );

  const countByApplication = new Map<number, number>();
  for (const row of counts) {
    if (row.applicationId) {
      countByApplication.set(row.applicationId, row._count._all);
    }
  }

  const hostedTextByApplication = new Set<number>();
  for (const source of hostedSources) {
    if (
      source.applicationId &&
      source.companyId === job.companyId &&
      hasEvidenceLikeText(source.hostedApplySubmission?.coverLetter)
    ) {
      hostedTextByApplication.add(source.applicationId);
    }
  }

  return {
    jobId: job.id,
    companyId: job.companyId,
    applications: applications.map((application) => ({
      applicationId: application.id,
      candidateId: application.candidateId,
      evidenceCount: countByApplication.get(application.id) ?? 0,
      hasHostedApplyText: hostedTextByApplication.has(application.id),
    })),
  };
}

export async function captureJobTextualEvidenceForAdmin(
  jobIdInput: unknown,
  browserInput?: unknown,
) {
  await requireCaptureAdmin();
  rejectForbiddenCaptureFields(browserInput);
  const jobId = validateCaptureJobId(jobIdInput);
  return executeCaptureJobTextualEvidence({ jobId });
}

export async function attachRecruiterTextualEvidenceForAdmin(
  jobIdInput: unknown,
  applicationIdInput: unknown,
  inlineTextInput: unknown,
  browserInput?: unknown,
) {
  const user = await requireCaptureAdmin();
  rejectForbiddenCaptureFields(browserInput);
  const jobId = validateCaptureJobId(jobIdInput);
  const applicationId = validateCaptureApplicationId(applicationIdInput);
  const inlineText = validateRecruiterEvidenceText(inlineTextInput);
  return executeAttachRecruiterTextualEvidence({
    jobId,
    applicationId,
    inlineText,
    actorUserId: user.id,
  });
}

export function isEvidenceCaptureActionError(
  error: unknown,
): error is
  | EvidenceCaptureError
  | EvidenceCaptureValidationError
  | AuthorizationError
  | AuthenticationError {
  return (
    error instanceof EvidenceCaptureError ||
    error instanceof EvidenceCaptureValidationError ||
    error instanceof AuthorizationError ||
    error instanceof AuthenticationError
  );
}

export function evidenceCaptureActionErrorMessage(error: unknown) {
  if (error instanceof EvidenceCaptureValidationError) {
    return error.message;
  }
  if (error instanceof EvidenceCaptureError) {
    if (
      error.code === "NO_TEXT" ||
      error.code === "INVALID_TEXT"
    ) {
      return error.message;
    }
    if (
      error.code === CAPTURE_JOB_NOT_FOUND ||
      error.code === CAPTURE_APPLICATION_NOT_FOUND ||
      error.code === CAPTURE_WRONG_TENANT
    ) {
      return "Resource not found.";
    }
    return CAPTURE_GENERIC_ERROR;
  }
  return "Resource not found.";
}
