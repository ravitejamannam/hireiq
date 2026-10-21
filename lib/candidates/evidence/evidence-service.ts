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
  CandidateEvidenceError,
  EVIDENCE_ALREADY_SUPERSEDED,
  EVIDENCE_APPLICATION_MISMATCH,
  EVIDENCE_IMMUTABLE,
  EVIDENCE_NOT_FOUND,
  EVIDENCE_TENANT_MISMATCH,
  EVIDENCE_UNCHANGED_REPLACEMENT,
} from "@/lib/candidates/evidence/evidence-errors";
import { hashEvidenceInlineTextOrNull } from "@/lib/candidates/evidence/evidence-hash";
import type { SafeCandidateEvidence } from "@/lib/candidates/evidence/evidence-types";
import { prisma } from "@/lib/prisma";
import {
  createEvidence,
  findApplicationInCompany,
  findCandidateHandle,
  findCandidateHandleInCompany,
  getEvidenceInCompany,
  listEvidenceForCandidate,
  listHostedApplyBackfillSources,
  revokeEvidence,
  setSupersededBy,
  type CandidateEvidenceRow,
  findEvidenceByHostedApplySubmission,
} from "@/lib/repositories/candidate-evidence-repository";
import {
  CandidateEvidenceValidationError,
  rejectForbiddenEvidenceFields,
  validateEvidenceCandidateId,
  validateEvidenceId,
  validateEvidenceInlineText,
  validateEvidenceOrigin,
  validateEvidenceSourceType,
} from "@/lib/validation/candidate-evidence-validation";

function evidenceNotFound(): never {
  throw new CandidateEvidenceError("Resource not found.", EVIDENCE_NOT_FOUND);
}

export function assertCanManageCandidateEvidence(role: PortalRole) {
  if (role !== PortalRole.ADMIN) {
    throw new AuthorizationError("Resource not found.");
  }
}

async function requireEvidenceAdmin() {
  const user = await requireAdmin();
  assertCanManageCandidateEvidence(user.role);
  return user;
}

function toSafe(row: CandidateEvidenceRow): SafeCandidateEvidence {
  return {
    id: row.id,
    companyId: row.companyId,
    candidateId: row.candidateId,
    applicationId: row.applicationId,
    jobTitle: row.application?.job.title ?? null,
    sourceType: row.sourceType,
    origin: row.origin,
    ingestionEventId: row.ingestionEventId,
    hostedApplySubmissionId: row.hostedApplySubmissionId,
    inlineText: row.inlineText,
    contentSha256: row.contentSha256,
    supersededById: row.supersededById,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    isRevoked: Boolean(row.revokedAt),
    isSuperseded: Boolean(row.supersededById),
  };
}

async function assertApplicationBelongsToCandidate(
  applicationId: number | null,
  candidateId: number,
  companyId: number,
) {
  if (applicationId === null) {
    return;
  }

  const application = await findApplicationInCompany(applicationId, companyId);
  if (!application) {
    throw new CandidateEvidenceError(
      "Application is not in this company.",
      EVIDENCE_TENANT_MISMATCH,
    );
  }
  if (application.candidateId !== candidateId) {
    throw new CandidateEvidenceError(
      "Evidence cannot belong to a different candidate's application.",
      EVIDENCE_APPLICATION_MISMATCH,
    );
  }
}

export async function executeCreateEvidence(input: {
  candidateId: number;
  applicationId: number | null;
  sourceType: CandidateEvidenceSourceType;
  origin: CandidateEvidenceOrigin;
  ingestionEventId: number | null;
  hostedApplySubmissionId: number | null;
  actorUserId: number | null;
  inlineText: string | null;
  createdAt?: Date;
}) {
  const candidate = await findCandidateHandle(input.candidateId);
  if (!candidate) {
    evidenceNotFound();
  }

  const scoped = await findCandidateHandleInCompany(
    candidate.id,
    candidate.companyId,
  );
  if (!scoped) {
    evidenceNotFound();
  }

  await assertApplicationBelongsToCandidate(
    input.applicationId,
    candidate.id,
    candidate.companyId,
  );

  const inlineText = validateEvidenceInlineText(input.inlineText);
  const row = await createEvidence({
    companyId: candidate.companyId,
    candidateId: candidate.id,
    applicationId: input.applicationId,
    sourceType: validateEvidenceSourceType(input.sourceType),
    origin: validateEvidenceOrigin(input.origin),
    ingestionEventId: input.ingestionEventId,
    hostedApplySubmissionId: input.hostedApplySubmissionId,
    actorUserId: input.actorUserId,
    inlineText,
    contentSha256: hashEvidenceInlineTextOrNull(inlineText),
    createdAt: input.createdAt,
  });
  // An erased candidate gets no new evidence.
  if (!row) evidenceNotFound();

  return toSafe(row);
}

export async function backfillHostedApplyEvidenceForCandidate(
  candidateId: number,
  companyId: number,
) {
  const candidate = await findCandidateHandleInCompany(candidateId, companyId);
  if (!candidate) {
    evidenceNotFound();
  }

  const sources = await listHostedApplyBackfillSources(candidateId, companyId);
  const created: SafeCandidateEvidence[] = [];

  for (const event of sources) {
    if (
      event.companyId !== companyId ||
      event.candidateId !== candidateId ||
      !event.applicationId ||
      !event.hostedApplySubmissionId ||
      !event.hostedApplySubmission ||
      !event.application
    ) {
      continue;
    }

    // Idempotency: ingestion (T91/T96) already captures evidence for
    // hosted-apply submissions transactionally. Skip anything that exists
    // instead of colliding with the unique constraint.
    const existing = await findEvidenceByHostedApplySubmission(
      event.hostedApplySubmissionId,
      companyId,
    );
    if (existing) {
      continue;
    }
    if (
      event.hostedApplySubmission.companyId !== companyId ||
      event.application.companyId !== companyId ||
      event.application.candidateId !== candidateId
    ) {
      continue;
    }

    const row = await executeCreateEvidence({
      candidateId,
      applicationId: event.applicationId,
      sourceType: CandidateEvidenceSourceType.HOSTED_APPLY_SUBMISSION,
      origin: CandidateEvidenceOrigin.CANDIDATE_PROVIDED,
      ingestionEventId: event.id,
      hostedApplySubmissionId: event.hostedApplySubmissionId,
      actorUserId: null,
      inlineText: event.hostedApplySubmission.coverLetter,
      createdAt: event.hostedApplySubmission.createdAt,
    });
    created.push(row);
  }

  return created;
}

export async function executeRevokeEvidence(input: {
  evidenceId: number;
  companyId: number;
  redactInlineText?: boolean;
}) {
  const existing = await getEvidenceInCompany(input.evidenceId, input.companyId);
  if (!existing) {
    evidenceNotFound();
  }

  const row = await revokeEvidence(
    existing.id,
    input.companyId,
    input.redactInlineText === true,
  );
  if (!row) {
    evidenceNotFound();
  }
  return toSafe(row);
}

export async function executeSupersedeEvidence(input: {
  evidenceId: number;
  inlineText: string | null;
  actorUserId: number | null;
}) {
  const loaded = await prisma.candidateEvidence.findFirst({
    where: { id: input.evidenceId },
    select: { id: true, companyId: true },
  });
  if (!loaded) {
    evidenceNotFound();
  }

  const existing = await getEvidenceInCompany(loaded.id, loaded.companyId);
  if (!existing) {
    evidenceNotFound();
  }
  if (existing.supersededById) {
    throw new CandidateEvidenceError(
      "This evidence artifact has already been superseded.",
      EVIDENCE_ALREADY_SUPERSEDED,
    );
  }

  const replacementText = validateEvidenceInlineText(input.inlineText);
  const replacementHash = hashEvidenceInlineTextOrNull(replacementText);
  if (
    replacementHash &&
    existing.contentSha256 &&
    replacementHash === existing.contentSha256
  ) {
    throw new CandidateEvidenceError(
      "Replacement text must differ from the current artifact.",
      EVIDENCE_UNCHANGED_REPLACEMENT,
    );
  }

  const replacement = await executeCreateEvidence({
    candidateId: existing.candidateId,
    applicationId: existing.applicationId,
    sourceType: existing.sourceType,
    origin: existing.origin,
    ingestionEventId: null,
    hostedApplySubmissionId: null,
    actorUserId: input.actorUserId,
    inlineText: input.inlineText,
  });

  const updated = await setSupersededBy(
    existing.id,
    existing.companyId,
    replacement.id,
  );
  if (!updated) {
    evidenceNotFound();
  }

  return { previous: toSafe(updated), current: replacement };
}

export function rejectEvidenceContentMutation() {
  throw new CandidateEvidenceError(
    "Evidence artifacts cannot be rewritten. Capture a new artifact instead.",
    EVIDENCE_IMMUTABLE,
  );
}

export async function getCandidateEvidence(candidateIdInput: unknown) {
  await requireEvidenceAdmin();
  const candidateId = validateEvidenceCandidateId(candidateIdInput);
  const candidate = await findCandidateHandle(candidateId);
  if (!candidate) {
    evidenceNotFound();
  }

  await backfillHostedApplyEvidenceForCandidate(
    candidate.id,
    candidate.companyId,
  );

  const rows = await listEvidenceForCandidate(candidate.id, candidate.companyId);
  return rows.map(toSafe);
}

export async function revokeCandidateEvidence(
  evidenceIdInput: unknown,
  browserInput?: unknown,
) {
  const user = await requireEvidenceAdmin();
  rejectForbiddenEvidenceFields(browserInput);
  const evidenceId = validateEvidenceId(evidenceIdInput);
  const existing = await prisma.candidateEvidence.findFirst({
    where: { id: evidenceId },
    select: { id: true, companyId: true },
  });
  if (!existing) {
    evidenceNotFound();
  }
  void user;
  return executeRevokeEvidence({
    evidenceId: existing.id,
    companyId: existing.companyId,
  });
}

export function isCandidateEvidenceActionError(
  error: unknown,
): error is
  | CandidateEvidenceError
  | CandidateEvidenceValidationError
  | AuthorizationError
  | AuthenticationError {
  return (
    error instanceof CandidateEvidenceError ||
    error instanceof CandidateEvidenceValidationError ||
    error instanceof AuthorizationError ||
    error instanceof AuthenticationError
  );
}

export function evidenceActionErrorMessage(error: unknown) {
  if (
    error instanceof CandidateEvidenceValidationError ||
    error instanceof CandidateEvidenceError
  ) {
    return error.message;
  }
  return "Resource not found.";
}
