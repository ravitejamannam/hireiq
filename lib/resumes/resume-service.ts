import { ResumeParseStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/authorization";
import {
  buildResumeStorageKey,
  ResumeStorageError,
  storeResume,
} from "@/lib/resumes/storage";
import {
  discardUnattachedResumeObject,
  releaseReplacedResumeObject,
} from "@/lib/resumes/resume-upload-cleanup";
import { scheduleBackgroundWork } from "@/lib/communication/schedule-background";
import { finishCandidateResumeParse, resumeParseIsReady } from "@/lib/resumes/resume-parse-job";

/**
 * Resume upload for existing candidates (T97 / constitution §29).
 *
 * Flow: validate → store binary → row with status PARSING → return.
 * Text extraction and field reading run after the response.
 *
 * Guarantees:
 * - Binaries never touch PostgreSQL (§29).
 * - Parse failure does not lose the upload: the document row is created
 *   with parseStatus=FAILED and the binary retained for retry.
 * - Evidence is only created from successfully extracted text, keeping
 *   evidence truthful (§1) and traceable to its document.
 */

export class ResumeUploadError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

const MAX_RESUME_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_EXTENSIONS = new Set(["pdf", "txt", "docx"]);

function sanitizeFileName(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new ResumeUploadError("FILE_NAME_REQUIRED");
  }
  // Strip any directory components from either separator — the client-
  // supplied name is metadata only and never touches a filesystem path.
  const parts = raw.trim().split(/[/\\]/);
  const base = parts[parts.length - 1] ?? "";
  if (!base || base.length > 180) {
    throw new ResumeUploadError("FILE_NAME_INVALID");
  }
  return base;
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

export type SafeResumeDocument = {
  id: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  parseStatus: string;
  parseErrorCode: string | null;
  createdAt: Date;
  hasEvidenceText: boolean;
};

export async function listResumeDocumentsForCandidate(candidateId: unknown) {
  await requireAdmin();

  const id = validateCandidateId(candidateId);
  const rows = await prisma.candidateResumeDocument.findMany({
    where: { candidateId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      contentType: true,
      sizeBytes: true,
      parseStatus: true,
      parseErrorCode: true,
      createdAt: true,
      extractedText: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    parseStatus: row.parseStatus,
    parseErrorCode: row.parseErrorCode,
    createdAt: row.createdAt,
    hasEvidenceText: Boolean(row.extractedText),
  }));
}

/** Hosted uploads and photos can share a binary with a candidate document. */
export async function resumeStorageKeyStillReferenced(storageKey: string): Promise<boolean> {
  const [documents, uploads, photos] = await Promise.all([
    prisma.candidateResumeDocument.count({ where: { storageKey } }),
    prisma.hostedApplyResumeUpload.count({ where: { storageKey } }),
    prisma.hostedApplyPhotoUpload.count({ where: { storageKey } }),
  ]);
  return documents + uploads + photos > 0;
}

export async function uploadResumeForAdmin(input: {
  candidateId: unknown;
  applicationId?: unknown;
  file: {
    name: unknown;
    type: unknown;
    bytes: Buffer;
  };
  actorUserId: number;
}): Promise<SafeResumeDocument> {
  await requireAdmin();

  const candidateId = validateCandidateId(input.candidateId);
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, companyId: true },
  });
  if (!candidate) {
    throw new ResumeUploadError("CANDIDATE_NOT_FOUND");
  }

  // Optional application scoping, validated against the same candidate+tenant.
  let applicationId: number | null = null;
  if (
    input.applicationId !== undefined &&
    input.applicationId !== null &&
    input.applicationId !== ""
  ) {
    const appId =
      typeof input.applicationId === "number" && Number.isInteger(input.applicationId)
        ? input.applicationId
        : typeof input.applicationId === "string" && /^\d+$/.test(input.applicationId)
          ? Number.parseInt(input.applicationId, 10)
          : NaN;
    if (!Number.isInteger(appId) || appId <= 0) {
      throw new ResumeUploadError("INVALID_APPLICATION_ID");
    }
    const application = await prisma.application.findFirst({
      where: { id: appId, candidateId, companyId: candidate.companyId },
      select: { id: true },
    });
    if (!application) {
      throw new ResumeUploadError("APPLICATION_NOT_FOUND");
    }
    applicationId = application.id;
  }

  const fileName = sanitizeFileName(input.file.name);
  const extension = extensionOf(fileName);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new ResumeUploadError("UNSUPPORTED_FILE_TYPE");
  }
  if (input.file.bytes.byteLength === 0) {
    throw new ResumeUploadError("EMPTY_FILE");
  }
  if (input.file.bytes.byteLength > MAX_RESUME_BYTES) {
    throw new ResumeUploadError("FILE_TOO_LARGE");
  }

  const storageKey = buildResumeStorageKey(candidate.companyId, candidateId, extension);
  const stored = await storeResume(storageKey, input.file.bytes);
  const contentType =
    extension === "pdf"
      ? "application/pdf"
      : extension === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "text/plain";

  const existing = await prisma.candidateResumeDocument.findFirst({
    where: { companyId: candidate.companyId, contentSha256: stored.contentSha256 },
  });
  if (existing && resumeParseIsReady(existing.parseStatus)) {
    await discardUnattachedResumeObject(stored.storageKey);
    return {
      id: existing.id,
      fileName: existing.fileName,
      contentType: existing.contentType,
      sizeBytes: existing.sizeBytes,
      parseStatus: "READY",
      parseErrorCode: existing.parseErrorCode,
      createdAt: existing.createdAt,
      hasEvidenceText: Boolean(existing.extractedText),
    };
  }

  let documentId = existing?.id ?? 0;
  try {
    if (existing) {
      await prisma.candidateResumeDocument.update({
        where: { id: existing.id },
        data: {
          storageKey: stored.storageKey,
          fileName,
          contentType,
          sizeBytes: stored.sizeBytes,
          parseStatus: ResumeParseStatus.PARSING,
          extractedText: null,
          parseErrorCode: null,
          fieldsNeedReview: false,
          fieldSuggestion: undefined,
          applicationId,
          uploadedByUserId: input.actorUserId,
        },
      });
      documentId = existing.id;
    } else {
      const created = await prisma.candidateResumeDocument.create({
        data: {
          companyId: candidate.companyId,
          candidateId,
          applicationId,
          storageKey: stored.storageKey,
          fileName,
          contentType,
          sizeBytes: stored.sizeBytes,
          contentSha256: stored.contentSha256,
          parseStatus: ResumeParseStatus.PARSING,
          uploadedByUserId: input.actorUserId,
        },
        select: { id: true },
      });
      documentId = created.id;
    }
  } catch (error) {
    await discardUnattachedResumeObject(stored.storageKey);
    throw error;
  }
  if (existing?.storageKey && existing.storageKey !== stored.storageKey) {
    await releaseReplacedResumeObject({
      previousKey: existing.storageKey,
      currentKey: stored.storageKey,
      stillReferenced: resumeStorageKeyStillReferenced,
    });
  }
  if (process.env.HIREIQ_SKIP_RESUME_PARSE !== "1") {
    scheduleBackgroundWork(() => finishCandidateResumeParse(documentId));
  }
  return {
    id: documentId,
    fileName,
    contentType,
    sizeBytes: stored.sizeBytes,
    parseStatus: "PARSING",
    parseErrorCode: null,
    createdAt: existing?.createdAt ?? new Date(),
    hasEvidenceText: false,
  };
}

function validateCandidateId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (parsed > 0) return parsed;
  }
  throw new ResumeUploadError("INVALID_CANDIDATE_ID");
}

export function resumeParseStatusNote(code: string | null): string | null {
  if (!code) return null;
  if (code === "OCR_EXHAUSTED") {
    return "Could not read this scan. Ask for a text-based PDF or DOCX.";
  }
  if (code === "OCR_DEFERRED" || code === "OCR_CLAIMED") {
    return "Scan saved. Reading it can take a while.";
  }
  if (code === "LOW_QUALITY") return "Text was extracted, but it looks incomplete.";
  if (code === "NEEDS_REVIEW") return "The file was read. Check the fields; some could not be filled automatically.";
  return code;
}

export function isResumeUploadActionError(error: unknown): boolean {
  return error instanceof ResumeUploadError || error instanceof ResumeStorageError;
}

export function resumeUploadActionErrorMessage(error: unknown): string {
  if (!(error instanceof ResumeUploadError) && !(error instanceof ResumeStorageError)) {
    return "Resume upload failed. Please try again.";
  }
  const code = error.code;
  switch (code) {
    case "UNSUPPORTED_FILE_TYPE":
    case "UNSUPPORTED_FORMAT":
      return "Upload a PDF, DOCX, or TXT resume. Images and other files are not accepted.";
    case "LEGACY_DOC_UNSUPPORTED":
      return "Older Word .doc files are not supported. Save the resume as PDF or DOCX and upload that.";
    case "FILE_TOO_LARGE":
      return "Resume must be 10MB or smaller.";
    case "EMPTY_FILE":
    case "EMPTY_DOCUMENT":
      return "The uploaded file appears to be empty.";
    case "OCR_DEFERRED":
      return "This looks like a scan. It is saved and will be read when the next OCR run picks it up. That can take longer than a few minutes.";
    case "OCR_EXHAUSTED":
      return "We could not read this scan after several tries. Ask for a text-based PDF or DOCX.";
    case "PDF_NO_TEXT_LAYER":
      return "This PDF has no readable text. Upload a text-based PDF, or a clearer scan.";
    case "PDF_PARSE_FAILED":
    case "BINARY_CONTENT_REJECTED":
      return "The file could not be read as a resume. It has been stored for review.";
    case "CANDIDATE_NOT_FOUND":
    case "APPLICATION_NOT_FOUND":
      return "Candidate or application not found.";
    default:
      return "Resume upload failed. Please try again.";
  }
}
