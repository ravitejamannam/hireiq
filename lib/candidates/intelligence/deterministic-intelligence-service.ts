import { CandidateIntelligenceExtractorType } from "@prisma/client";

import {
  AuthenticationError,
  AuthorizationError,
  requireAdmin,
} from "@/lib/auth/authorization";
import {
  extractClaimsDeterministically,
  DETERMINISTIC_EXTRACTOR_VERSION,
  DETERMINISTIC_MODEL_NAME,
  DETERMINISTIC_MODEL_PROVIDER,
  DETERMINISTIC_PROMPT_VERSION,
} from "@/lib/candidates/intelligence/deterministic-extractor";
import {
  CandidateIntelligenceError,
  INTELLIGENCE_AI_IN_PROGRESS,
  INTELLIGENCE_EVIDENCE_REVOKED,
  INTELLIGENCE_EVIDENCE_SUPERSEDED,
  INTELLIGENCE_INTERNAL_ERROR,
  INTELLIGENCE_NOT_FOUND,
  INTELLIGENCE_UNCHANGED_ERROR,
} from "@/lib/candidates/intelligence/intelligence-errors";
import {
  assertCanManageCandidateIntelligence,
  STALE_RUNNING_MS,
} from "@/lib/candidates/intelligence/intelligence-service";
import type { SafeCandidateIntelligenceRun } from "@/lib/candidates/intelligence/intelligence-types";
import { prisma } from "@/lib/prisma";
import {
  createClaimsForRun,
  createIntelligenceRun,
  findCandidateHandleInCompany,
  findCompletedRun,
  findLatestRunningRun,
  getEvidenceByIdForIntelligence,
  getRunWithClaims,
  markRunCompleted,
  markRunFailed,
  type IntelligenceRunKey,
} from "@/lib/repositories/candidate-intelligence-repository";
import {
  rejectForbiddenIntelligenceFields,
  validateIntelligenceCandidateId,
  validateIntelligenceEvidenceId,
} from "@/lib/validation/candidate-intelligence-validation";

function intelligenceNotFound(): never {
  throw new CandidateIntelligenceError(
    "Resource not found.",
    INTELLIGENCE_NOT_FOUND,
  );
}

function toSafeRun(
  row: NonNullable<Awaited<ReturnType<typeof getRunWithClaims>>>,
): SafeCandidateIntelligenceRun {
  return {
    id: row.id,
    companyId: row.companyId,
    candidateId: row.candidateId,
    evidenceId: row.evidenceId,
    status: row.status,
    extractorType: row.extractorType,
    extractorVersion: row.extractorVersion,
    modelProvider: row.modelProvider,
    modelName: row.modelName,
    promptVersion: row.promptVersion,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    errorCode: row.errorCode,
    durationMs: row.durationMs,
    claims: row.claims.map((claim) => ({
      id: claim.id,
      companyId: claim.companyId,
      candidateId: claim.candidateId,
      runId: claim.runId,
      evidenceId: claim.evidenceId,
      claimType: claim.claimType,
      value: claim.value,
      normalizedValue: claim.normalizedValue,
      createdAt: claim.createdAt,
    })),
  };
}

export async function executeRunDeterministicIntelligence(input: {
  candidateId: number;
  evidenceId: number;
}): Promise<SafeCandidateIntelligenceRun> {
  const evidence = await getEvidenceByIdForIntelligence(input.evidenceId);
  if (!evidence || evidence.candidateId !== input.candidateId) {
    intelligenceNotFound();
  }
  const candidate = await findCandidateHandleInCompany(
    evidence.candidateId,
    evidence.companyId,
  );
  if (!candidate) {
    intelligenceNotFound();
  }
  if (evidence.revokedAt) {
    throw new CandidateIntelligenceError(
      "This evidence artifact has been revoked.",
      INTELLIGENCE_EVIDENCE_REVOKED,
    );
  }
  if (evidence.supersededById) {
    throw new CandidateIntelligenceError(
      "This evidence artifact has been superseded. Generate intelligence from the current artifact.",
      INTELLIGENCE_EVIDENCE_SUPERSEDED,
    );
  }

  const key: IntelligenceRunKey = {
    companyId: evidence.companyId,
    candidateId: evidence.candidateId,
    evidenceId: evidence.id,
    extractorType: CandidateIntelligenceExtractorType.DETERMINISTIC_TEXT_V1,
    extractorVersion: DETERMINISTIC_EXTRACTOR_VERSION,
    modelProvider: DETERMINISTIC_MODEL_PROVIDER,
    modelName: DETERMINISTIC_MODEL_NAME,
    promptVersion: DETERMINISTIC_PROMPT_VERSION,
  };

  const existing = await findCompletedRun(key);
  if (existing) {
    return toSafeRun(existing);
  }

  const running = await findLatestRunningRun(key);
  if (running) {
    const ageMs = Date.now() - running.createdAt.getTime();
    if (ageMs < STALE_RUNNING_MS) {
      throw new CandidateIntelligenceError(
        "Candidate intelligence is already being generated.",
        INTELLIGENCE_AI_IN_PROGRESS,
      );
    }
    await markRunFailed(
      running.id,
      running.companyId,
      INTELLIGENCE_INTERNAL_ERROR,
      Date.now() - running.createdAt.getTime(),
    );
  }

  const run = await createIntelligenceRun(key);
  const startedAt = Date.now();
  try {
    const claims = extractClaimsDeterministically(evidence.inlineText ?? "");
    const durationMs = Date.now() - startedAt;
    const row = await prisma.$transaction(async (tx) => {
      const raced = await findCompletedRun(key, tx);
      if (raced) {
        await markRunFailed(
          run.id,
          key.companyId,
          INTELLIGENCE_INTERNAL_ERROR,
          durationMs,
          tx,
        );
        return raced;
      }
      await createClaimsForRun(
        {
          companyId: key.companyId,
          candidateId: key.candidateId,
          runId: run.id,
          evidenceId: evidence.id,
          claims,
        },
        tx,
      );
      const updated = await markRunCompleted(run.id, key.companyId, durationMs, tx);
      if (updated.count !== 1) {
        throw new CandidateIntelligenceError(
          INTELLIGENCE_UNCHANGED_ERROR,
          INTELLIGENCE_INTERNAL_ERROR,
        );
      }
      const completed = await getRunWithClaims(run.id, key.companyId, tx);
      if (!completed) {
        throw new CandidateIntelligenceError(
          INTELLIGENCE_UNCHANGED_ERROR,
          INTELLIGENCE_INTERNAL_ERROR,
        );
      }
      return completed;
    });
    return toSafeRun(row);
  } catch (error) {
    await markRunFailed(
      run.id,
      key.companyId,
      error instanceof CandidateIntelligenceError
        ? error.code
        : INTELLIGENCE_INTERNAL_ERROR,
      Date.now() - startedAt,
    );
    if (error instanceof CandidateIntelligenceError) {
      throw error;
    }
    throw new CandidateIntelligenceError(
      INTELLIGENCE_UNCHANGED_ERROR,
      INTELLIGENCE_INTERNAL_ERROR,
    );
  }
}

export async function runDeterministicIntelligenceForAdmin(
  candidateIdInput: unknown,
  evidenceIdInput: unknown,
  browserInput?: unknown,
) {
  const user = await requireAdmin();
  assertCanManageCandidateIntelligence(user.role);
  rejectForbiddenIntelligenceFields(browserInput);
  return executeRunDeterministicIntelligence({
    candidateId: validateIntelligenceCandidateId(candidateIdInput),
    evidenceId: validateIntelligenceEvidenceId(evidenceIdInput),
  });
}

export function isDeterministicIntelligenceActionError(
  error: unknown,
): error is CandidateIntelligenceError | AuthorizationError | AuthenticationError {
  return (
    error instanceof CandidateIntelligenceError ||
    error instanceof AuthorizationError ||
    error instanceof AuthenticationError
  );
}
