import {
  CandidateEvidenceOrigin,
  CandidateEvidenceSourceType,
  HostedResumeParseStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  buildResumeStorageKey,
  storeResume,
} from "@/lib/resumes/storage";
import { abandonNewResumeObject } from "@/lib/resumes/resume-upload-cleanup";
import {
  extractResumeText,
  RESUME_TEXT_EXTRACTOR_VERSION,
} from "@/lib/resumes/text-extraction";
import { proposeResumeFields, suggestionFromFields, type ResumeFormSuggestion } from "@/lib/resumes/resume-field-extractor";
import type { Prisma } from "@prisma/client";
import { generateSecureToken, hashSecureToken } from "@/lib/auth/secure-token";
import { createEvidence } from "@/lib/repositories/candidate-evidence-repository";
import { hashEvidenceInlineTextOrNull } from "@/lib/candidates/evidence/evidence-hash";

/**
 * Resume upload for the PUBLIC hosted-apply flow (T104).
 *
 * The candidate is unauthenticated and does not exist yet, so uploads are
 * stored as PENDING rows bound to the apply token's distribution. A
 * one-time claim token (hash-only persistence, short TTL) is returned to
 * the client; the application submit presents it and ingestion claims the
 * upload inside its transaction — creating the canonical
 * CandidateResumeDocument + RESUME_DOCUMENT evidence there (same
 * provenance chain as every other channel).
 */

export class HostedResumeError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const MAX_RESUME_BYTES = 10 * 1024 * 1024;
const CLAIM_TTL_HOURS = 2;
const ALLOWED_EXTENSIONS = new Set(["pdf", "txt", "docx"]);

function sanitizeFileName(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new HostedResumeError("FILE_NAME_REQUIRED");
  }
  const parts = raw.trim().split(/[/\\]/);
  const base = parts[parts.length - 1] ?? "";
  if (!base || base.length > 180) throw new HostedResumeError("FILE_NAME_INVALID");
  return base;
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

/**
 * The stored object is deleted only when the insert throws.
 * Suggestion work runs after that and cannot delete the file.
 */
export async function finishHostedResumeUpload<T>(input: {
  storageKey: string;
  insert: () => Promise<void>;
  suggest: () => Promise<T>;
  remove?: (key: string) => Promise<void>;
}): Promise<T> {
  try {
    await input.insert();
  } catch (error) {
    await abandonNewResumeObject(input.storageKey, error, input.remove);
    throw error;
  }
  return input.suggest();
}

/** POST /api/apply/[token]/resume — store + parse, return one-time claim. */
export async function storePendingHostedResume(input: {
  applyTokenRaw: string;
  fileName: unknown;
  contentType?: unknown;
  bytes: Buffer;
}): Promise<{
  resumeClaim: string;
  fileName: string;
  sizeBytes: number;
  parseStatus: "PARSED" | "FAILED";
  parseErrorCode: string | null;
  extractedPreview: string | null;
  suggestion: ResumeFormSuggestion | null;
}> {
  const applyTokenHash = hashSecureToken(input.applyTokenRaw);
  const tokenRow = await prisma.applyToken.findUnique({
    where: { tokenHash: applyTokenHash },
    select: {
      id: true,
      revokedAt: true,
      distribution: {
        select: { id: true, companyId: true, jobId: true },
      },
    },
  });
  if (!tokenRow || tokenRow.revokedAt) {
    throw new HostedResumeError("APPLY_LINK_INVALID");
  }

  const fileName = sanitizeFileName(input.fileName);
  const extension = extensionOf(fileName);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new HostedResumeError("UNSUPPORTED_FILE_TYPE");
  }
  if (input.bytes.byteLength === 0) throw new HostedResumeError("EMPTY_FILE");
  if (input.bytes.byteLength > MAX_RESUME_BYTES) {
    throw new HostedResumeError("FILE_TOO_LARGE");
  }

  const storageKey = buildResumeStorageKey(
    tokenRow.distribution.companyId,
    tokenRow.distribution.jobId,
    extension,
  );
  const stored = await storeResume(storageKey, input.bytes);
  let extraction: Awaited<ReturnType<typeof extractResumeText>>;
  try {
    extraction = await extractResumeText(input.bytes, {
      fileName,
      contentType: typeof input.contentType === "string" ? input.contentType : undefined,
      ocr: "skip",
    });
  } catch (error) {
    await abandonNewResumeObject(stored.storageKey, error);
    throw error;
  }
  const generated = generateSecureToken();

  return finishHostedResumeUpload({
    storageKey: stored.storageKey,
    insert: async () => {
      await prisma.hostedApplyResumeUpload.create({
        data: {
          distributionId: tokenRow.distribution.id,
          jobId: tokenRow.distribution.jobId,
          companyId: tokenRow.distribution.companyId,
          applyTokenHash,
          hostedApplySubmissionId: null,
          claimTokenHash: generated.tokenHash,
          storageKey: stored.storageKey,
          fileName,
          contentType:
            extension === "pdf"
              ? "application/pdf"
              : extension === "docx"
                ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                : "text/plain",
          sizeBytes: stored.sizeBytes,
          contentSha256: stored.contentSha256,
          parseStatus: extraction.ok
            ? HostedResumeParseStatus.PARSED
            : HostedResumeParseStatus.FAILED,
          extractedText: extraction.ok ? extraction.text : null,
          extractorVersion: extraction.ok ? RESUME_TEXT_EXTRACTOR_VERSION : null,
          parseErrorCode: extraction.ok
            ? extraction.quality.needsReview
              ? "LOW_QUALITY"
              : null
            : extraction.errorCode,
          expiresAt: new Date(Date.now() + CLAIM_TTL_HOURS * 60 * 60 * 1000),
        },
      });
    },
    suggest: async () => {
      const suggestion = extraction.ok
        ? suggestionFromFields((await proposeResumeFields(extraction.text)) ?? {
            fullName: null,
            email: null,
            phone: null,
            skills: [],
            experience: [],
            education: [],
            certifications: [],
            projects: [],
          })
        : null;
      return {
        resumeClaim: generated.rawToken,
        fileName,
        sizeBytes: stored.sizeBytes,
        parseStatus: extraction.ok ? "PARSED" as const : "FAILED" as const,
        parseErrorCode: extraction.ok ? extraction.quality.needsReview ? "LOW_QUALITY" : null : extraction.errorCode,
        extractedPreview: extraction.ok ? extraction.text.slice(0, 400) : null,
        suggestion: suggestion && (suggestion.fullName || suggestion.email || suggestion.phone || suggestion.experiences.length || suggestion.education.length || suggestion.projects.length || suggestion.certifications.length || suggestion.skills.length)
          ? suggestion
          : null,
      };
    },
  });
}

/**
 * Bind a pending upload to a submission at submit time. Guarded so a claim
 * can only ever be bound once; ownership is verified against the live
 * apply token presented for submission.
 */
export async function bindPendingResumeToSubmission(input: {
  applyTokenRaw: string;
  submissionId: number;
  resumeClaim: unknown;
}): Promise<number | null> {
  if (typeof input.resumeClaim !== "string" || !input.resumeClaim.trim()) {
    return null;
  }
  const applyTokenHash = hashSecureToken(input.applyTokenRaw);
  const claimHash = hashSecureToken(input.resumeClaim.trim());

  const pending = await prisma.hostedApplyResumeUpload.findUnique({
    where: { claimTokenHash: claimHash },
    select: {
      id: true,
      applyTokenHash: true,
      claimedAt: true,
      expiresAt: true,
    },
  });
  if (
    !pending ||
    pending.claimedAt ||
    pending.expiresAt.getTime() < Date.now() ||
    pending.applyTokenHash !== applyTokenHash
  ) {
    throw new HostedResumeError("RESUME_CLAIM_INVALID");
  }

  // Guarded single bind: a replayed idempotent submit with the same claim
  // finds the row already bound and reuses it instead of failing.
  const alreadyBound = await prisma.hostedApplyResumeUpload.findFirst({
    where: { hostedApplySubmissionId: input.submissionId },
    select: { id: true },
  });
  if (alreadyBound?.id === pending.id) {
    return pending.id;
  }

  const bound = await prisma.hostedApplyResumeUpload.updateMany({
    where: { id: pending.id, hostedApplySubmissionId: null },
    data: { hostedApplySubmissionId: input.submissionId },
  });
  if (bound.count !== 1) {
    throw new HostedResumeError("RESUME_CLAIM_INVALID");
  }
  return pending.id;
}

/** Core promotion inside the ingestion transaction. Caller holds locks. */
type IngestionTx = Prisma.TransactionClient;

export async function claimPendingResumeInIngestion(
  tx: IngestionTx,
  submissionId: number,
  input: {
    companyId: number;
    candidateId: number;
    applicationId: number;
    occurredAt: Date;
  },
): Promise<void> {
  const pending = await tx.hostedApplyResumeUpload.findFirst({
    where: { hostedApplySubmissionId: submissionId },
  });
  if (!pending) return;

  // Claim guard: only one ingestion pass may promote this upload.
  await tx.hostedApplyResumeUpload.updateMany({
    where: { id: pending.id, claimedAt: null },
    data: { claimedAt: new Date() },
  });

  const lowQuality =
    pending.parseStatus === HostedResumeParseStatus.PARSED &&
    pending.parseErrorCode === "LOW_QUALITY";

  await tx.candidateResumeDocument.create({
    data: {
      companyId: input.companyId,
      candidateId: input.candidateId,
      applicationId: input.applicationId,
      storageKey: pending.storageKey,
      fileName: pending.fileName,
      contentType: pending.contentType,
      sizeBytes: pending.sizeBytes,
      contentSha256: pending.contentSha256,
      parseStatus:
        pending.parseStatus === HostedResumeParseStatus.PARSED ? "PARSED" : "FAILED",
      extractedText: pending.extractedText,
      extractorVersion:
        pending.parseStatus === HostedResumeParseStatus.PARSED
          ? RESUME_TEXT_EXTRACTOR_VERSION
          : null,
      parseErrorCode: lowQuality
        ? "LOW_QUALITY"
        : pending.parseStatus === HostedResumeParseStatus.PARSED
          ? null
          : pending.parseErrorCode,
      ocrAttempts: pending.ocrAttempts,
      createdAt: pending.createdAt,
    },
  });

  // Evidence only from clean extracted text. Low-quality text stays on the document.
  if (
    pending.parseStatus === HostedResumeParseStatus.PARSED &&
    !lowQuality &&
    pending.extractedText &&
    pending.extractedText.trim()
  ) {
    await createEvidence({
      companyId: input.companyId,
      candidateId: input.candidateId,
      applicationId: input.applicationId,
      sourceType: CandidateEvidenceSourceType.RESUME_DOCUMENT,
      origin: CandidateEvidenceOrigin.CANDIDATE_PROVIDED,
      ingestionEventId: null,
      hostedApplySubmissionId: null,
      actorUserId: null,
      inlineText: pending.extractedText,
      contentSha256: hashEvidenceInlineTextOrNull(pending.extractedText),
      createdAt: pending.createdAt,
    }, tx);
  }
}
