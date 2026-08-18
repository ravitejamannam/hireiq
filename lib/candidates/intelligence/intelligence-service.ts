import {
  CandidateIntelligenceExtractorType,
  PortalRole,
} from "@prisma/client";

import {
  AuthenticationError,
  AuthorizationError,
  requireAdmin,
} from "@/lib/auth/authorization";
import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForCandidate,
  rateLimitKeyForUser,
} from "@/lib/auth/rate-limit";
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
  extractClaimsFromEvidenceText,
  getCandidateIntelligenceAiModel,
  getCandidateIntelligenceAiProviderLabel,
} from "@/lib/candidates/intelligence/intelligence-extractor";
import {
  CANDIDATE_INTELLIGENCE_EXTRACTOR_VERSION,
  CANDIDATE_INTELLIGENCE_PROMPT_VERSION,
} from "@/lib/candidates/intelligence/intelligence-prompt";
import type {
  CandidateIntelligencePageData,
  ExtractedClaimDraft,
  SafeCandidateClaim,
  SafeCandidateIntelligenceRun,
} from "@/lib/candidates/intelligence/intelligence-types";
import { prisma } from "@/lib/prisma";
import {
  createClaimsForRun,
  createIntelligenceRun,
  findCandidateHandle,
  findCandidateHandleInCompany,
  findCompletedRun,
  findLatestRunningRun,
  getEvidenceByIdForIntelligence,
  getRunWithClaims,
  listRunsForCandidate,
  markRunCompleted,
  markRunFailed,
  type CandidateIntelligenceRunRow,
  type IntelligenceEvidenceRow,
  type IntelligenceRunKey,
} from "@/lib/repositories/candidate-intelligence-repository";
import {
  CandidateIntelligenceValidationError,
  rejectForbiddenIntelligenceFields,
  validateIntelligenceCandidateId,
  validateIntelligenceEvidenceId,
} from "@/lib/validation/candidate-intelligence-validation";

export const STALE_RUNNING_MS = 60_000;

function intelligenceNotFound(): never {
  throw new CandidateIntelligenceError(
    "Resource not found.",
    INTELLIGENCE_NOT_FOUND,
  );
}

export function assertCanManageCandidateIntelligence(role: PortalRole) {
  if (role !== PortalRole.ADMIN) {
    throw new AuthorizationError("Resource not found.");
  }
}

async function requireIntelligenceAdmin() {
  const user = await requireAdmin();
  assertCanManageCandidateIntelligence(user.role);
  return user;
}

function toSafeClaim(
  row: CandidateIntelligenceRunRow["claims"][number],
): SafeCandidateClaim {
  return {
    id: row.id,
    companyId: row.companyId,
    candidateId: row.candidateId,
    runId: row.runId,
    evidenceId: row.evidenceId,
    claimType: row.claimType,
    value: row.value,
    normalizedValue: row.normalizedValue,
    createdAt: row.createdAt,
  };
}

function toSafeRun(row: CandidateIntelligenceRunRow): SafeCandidateIntelligenceRun {
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
    claims: row.claims.map(toSafeClaim),
  };
}

function currentRunKey(
  evidence: IntelligenceEvidenceRow,
  modelProvider: string,
  modelName: string,
): IntelligenceRunKey {
  return {
    companyId: evidence.companyId,
    candidateId: evidence.candidateId,
    evidenceId: evidence.id,
    extractorType: CandidateIntelligenceExtractorType.COVER_LETTER_CLAIMS,
    extractorVersion: CANDIDATE_INTELLIGENCE_EXTRACTOR_VERSION,
    modelProvider,
    modelName,
    promptVersion: CANDIDATE_INTELLIGENCE_PROMPT_VERSION,
  };
}

function logAiEvent(
  event:
    | "ai_candidate_intelligence_started"
    | "ai_candidate_intelligence_completed"
    | "ai_candidate_intelligence_failed",
  metadata: Record<string, unknown>,
) {
  console.log(`[ai] ${event}`, metadata);
}

function errorCodeFromUnknown(error: unknown) {
  if (error instanceof CandidateIntelligenceError) {
    return error.code;
  }
  return INTELLIGENCE_INTERNAL_ERROR;
}

async function failRun(
  runId: number,
  companyId: number,
  errorCode: string,
  durationMs: number,
) {
  await markRunFailed(runId, companyId, errorCode, durationMs);
}

async function completeRunWithClaims(input: {
  runId: number;
  key: IntelligenceRunKey;
  evidence: IntelligenceEvidenceRow;
  claims: ExtractedClaimDraft[];
  startedAt: number;
  provider: string;
  model: string;
}) {
  const durationMs = Date.now() - input.startedAt;

  try {
    const row = await prisma.$transaction(async (tx) => {
      const raced = await findCompletedRun(input.key, tx);
      if (raced) {
        await markRunFailed(
          input.runId,
          input.key.companyId,
          INTELLIGENCE_INTERNAL_ERROR,
          durationMs,
          tx,
        );
        return raced;
      }

      await createClaimsForRun(
        {
          companyId: input.key.companyId,
          candidateId: input.key.candidateId,
          runId: input.runId,
          evidenceId: input.evidence.id,
          claims: input.claims,
        },
        tx,
      );

      const updated = await markRunCompleted(
        input.runId,
        input.key.companyId,
        durationMs,
        tx,
      );
      if (updated.count !== 1) {
        throw new CandidateIntelligenceError(
          INTELLIGENCE_UNCHANGED_ERROR,
          INTELLIGENCE_INTERNAL_ERROR,
        );
      }

      const completed = await getRunWithClaims(
        input.runId,
        input.key.companyId,
        tx,
      );
      if (!completed) {
        throw new CandidateIntelligenceError(
          INTELLIGENCE_UNCHANGED_ERROR,
          INTELLIGENCE_INTERNAL_ERROR,
        );
      }
      return completed;
    });

    logAiEvent("ai_candidate_intelligence_completed", {
      runId: row.id,
      candidateId: row.candidateId,
      evidenceId: row.evidenceId,
      companyId: row.companyId,
      provider: input.provider,
      model: input.model,
      durationMs: row.durationMs,
      status: row.status,
    });

    return toSafeRun(row);
  } catch (error) {
    await failRun(
      input.runId,
      input.key.companyId,
      errorCodeFromUnknown(error),
      durationMs,
    );
    logAiEvent("ai_candidate_intelligence_failed", {
      runId: input.runId,
      candidateId: input.key.candidateId,
      evidenceId: input.key.evidenceId,
      companyId: input.key.companyId,
      provider: input.provider,
      model: input.model,
      durationMs,
      status: "FAILED",
      errorCode: errorCodeFromUnknown(error),
    });
    if (error instanceof CandidateIntelligenceError) {
      throw error;
    }
    throw new CandidateIntelligenceError(
      INTELLIGENCE_UNCHANGED_ERROR,
      INTELLIGENCE_INTERNAL_ERROR,
    );
  }
}

export async function executeGenerateCandidateIntelligence(input: {
  candidateId: number;
  evidenceId: number;
}): Promise<SafeCandidateIntelligenceRun> {
  const evidence = await getEvidenceByIdForIntelligence(input.evidenceId);
  if (!evidence) {
    intelligenceNotFound();
  }
  if (evidence.candidateId !== input.candidateId) {
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

  const provider = getCandidateIntelligenceAiProviderLabel();
  const model = getCandidateIntelligenceAiModel();
  const key = currentRunKey(evidence, provider, model);

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
      ageMs,
    );
  }

  const run = await createIntelligenceRun(key);
  const startedAt = Date.now();
  logAiEvent("ai_candidate_intelligence_started", {
    runId: run.id,
    candidateId: evidence.candidateId,
    evidenceId: evidence.id,
    companyId: evidence.companyId,
    provider,
    model,
  });

  const inlineText = evidence.inlineText;
  if (inlineText === null || inlineText.trim() === "") {
    return completeRunWithClaims({
      runId: run.id,
      key,
      evidence,
      claims: [],
      startedAt,
      provider,
      model,
    });
  }

  try {
    const claims = await extractClaimsFromEvidenceText(inlineText);
    return completeRunWithClaims({
      runId: run.id,
      key,
      evidence,
      claims,
      startedAt,
      provider,
      model,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errorCode = errorCodeFromUnknown(error);
    await failRun(run.id, evidence.companyId, errorCode, durationMs);
    logAiEvent("ai_candidate_intelligence_failed", {
      runId: run.id,
      candidateId: evidence.candidateId,
      evidenceId: evidence.id,
      companyId: evidence.companyId,
      provider,
      model,
      durationMs,
      status: "FAILED",
      errorCode,
    });
    if (error instanceof CandidateIntelligenceError) {
      throw error;
    }
    throw new CandidateIntelligenceError(
      INTELLIGENCE_UNCHANGED_ERROR,
      INTELLIGENCE_INTERNAL_ERROR,
    );
  }
}

export async function getCandidateIntelligence(
  candidateIdInput: unknown,
): Promise<CandidateIntelligencePageData> {
  await requireIntelligenceAdmin();
  const candidateId = validateIntelligenceCandidateId(candidateIdInput);
  const candidate = await findCandidateHandle(candidateId);
  if (!candidate) {
    intelligenceNotFound();
  }

  const runs = await listRunsForCandidate(candidate.id, candidate.companyId);
  return {
    candidateId: candidate.id,
    runs: runs.map(toSafeRun),
  };
}

export async function generateCandidateIntelligenceForAdmin(
  candidateIdInput: unknown,
  evidenceIdInput: unknown,
  browserInput?: unknown,
) {
  const user = await requireIntelligenceAdmin();
  rejectForbiddenIntelligenceFields(browserInput);
  const candidateId = validateIntelligenceCandidateId(candidateIdInput);
  const evidenceId = validateIntelligenceEvidenceId(evidenceIdInput);

  await consumeAuthRateLimit({
    name: "aiCandidateIntelligenceUser",
    key: rateLimitKeyForUser(user.id),
  });
  await consumeAuthRateLimit({
    name: "aiCandidateIntelligenceCandidate",
    key: rateLimitKeyForCandidate(candidateId),
  });

  return executeGenerateCandidateIntelligence({ candidateId, evidenceId });
}

export function isCandidateIntelligenceActionError(
  error: unknown,
): error is
  | CandidateIntelligenceError
  | CandidateIntelligenceValidationError
  | AuthorizationError
  | AuthenticationError
  | RateLimitError {
  return (
    error instanceof CandidateIntelligenceError ||
    error instanceof CandidateIntelligenceValidationError ||
    error instanceof AuthorizationError ||
    error instanceof AuthenticationError ||
    error instanceof RateLimitError
  );
}

export function intelligenceActionErrorMessage(error: unknown) {
  if (error instanceof RateLimitError) {
    return error.message;
  }
  if (error instanceof CandidateIntelligenceValidationError) {
    return error.message;
  }
  if (error instanceof CandidateIntelligenceError) {
    if (
      error.code === INTELLIGENCE_EVIDENCE_REVOKED ||
      error.code === INTELLIGENCE_EVIDENCE_SUPERSEDED ||
      error.code === INTELLIGENCE_AI_IN_PROGRESS
    ) {
      return error.message;
    }
    if (error.code === INTELLIGENCE_NOT_FOUND) {
      return "Resource not found.";
    }
    return INTELLIGENCE_UNCHANGED_ERROR;
  }
  return "Resource not found.";
}
