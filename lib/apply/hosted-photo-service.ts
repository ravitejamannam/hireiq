import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { generateSecureToken, hashSecureToken } from "@/lib/auth/secure-token";
import {
  buildResumeStorageKey,
  storeResume,
} from "@/lib/resumes/storage";

export class HostedPhotoError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const CLAIM_TTL_HOURS = 2;

const PHOTO_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function sanitizeFileName(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new HostedPhotoError("FILE_NAME_REQUIRED");
  }
  const parts = raw.trim().split(/[/\\]/);
  const base = parts[parts.length - 1] ?? "";
  if (!base || base.length > 180) throw new HostedPhotoError("FILE_NAME_INVALID");
  return base;
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

function sniffImageType(bytes: Buffer): keyof typeof PHOTO_TYPES | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

export async function storePendingHostedPhoto(input: {
  applyTokenRaw: string;
  fileName: unknown;
  bytes: Buffer;
}): Promise<{ photoClaim: string; fileName: string; sizeBytes: number }> {
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
    throw new HostedPhotoError("APPLY_LINK_INVALID");
  }

  const fileName = sanitizeFileName(input.fileName);
  const sniffed = sniffImageType(input.bytes);
  const extension = sniffed ?? extensionOf(fileName);
  if (!PHOTO_TYPES[extension]) {
    throw new HostedPhotoError("UNSUPPORTED_FILE_TYPE");
  }
  if (input.bytes.byteLength === 0) throw new HostedPhotoError("EMPTY_FILE");
  if (input.bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new HostedPhotoError("FILE_TOO_LARGE");
  }

  const storageKey = buildResumeStorageKey(
    tokenRow.distribution.companyId,
    tokenRow.distribution.jobId,
    extension === "jpeg" ? "jpg" : extension,
  );
  const stored = await storeResume(storageKey, input.bytes);
  const { rawToken: claimToken, tokenHash: claimHash } = generateSecureToken();

  await prisma.hostedApplyPhotoUpload.create({
    data: {
      distributionId: tokenRow.distribution.id,
      jobId: tokenRow.distribution.jobId,
      companyId: tokenRow.distribution.companyId,
      applyTokenHash,
      hostedApplySubmissionId: null,
      claimTokenHash: claimHash,
      storageKey: stored.storageKey,
      fileName,
      contentType: PHOTO_TYPES[extension],
      sizeBytes: stored.sizeBytes,
      contentSha256: stored.contentSha256,
      expiresAt: new Date(Date.now() + CLAIM_TTL_HOURS * 60 * 60 * 1000),
    },
  });

  return {
    photoClaim: claimToken,
    fileName,
    sizeBytes: stored.sizeBytes,
  };
}

export async function bindPendingPhotoToSubmission(input: {
  applyTokenRaw: string;
  submissionId: number;
  photoClaim: unknown;
}): Promise<number | null> {
  if (typeof input.photoClaim !== "string" || !input.photoClaim.trim()) {
    return null;
  }
  const applyTokenHash = hashSecureToken(input.applyTokenRaw);
  const claimHash = hashSecureToken(input.photoClaim.trim());

  const pending = await prisma.hostedApplyPhotoUpload.findUnique({
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
    throw new HostedPhotoError("PHOTO_CLAIM_INVALID");
  }

  const alreadyBound = await prisma.hostedApplyPhotoUpload.findFirst({
    where: { hostedApplySubmissionId: input.submissionId },
    select: { id: true },
  });
  if (alreadyBound?.id === pending.id) {
    return pending.id;
  }

  const bound = await prisma.hostedApplyPhotoUpload.updateMany({
    where: { id: pending.id, hostedApplySubmissionId: null },
    data: { hostedApplySubmissionId: input.submissionId },
  });
  if (bound.count !== 1) {
    throw new HostedPhotoError("PHOTO_CLAIM_INVALID");
  }
  return pending.id;
}

type IngestionTx = Prisma.TransactionClient;

export async function claimPendingPhotoInIngestion(
  tx: IngestionTx,
  submissionId: number,
  input: { candidateId: number; companyId: number },
): Promise<void> {
  const pending = await tx.hostedApplyPhotoUpload.findFirst({
    where: { hostedApplySubmissionId: submissionId },
  });
  if (!pending) return;

  await tx.hostedApplyPhotoUpload.updateMany({
    where: { id: pending.id, claimedAt: null },
    data: { claimedAt: new Date() },
  });

  await tx.candidateProfile.update({
    where: { candidateId: input.candidateId },
    data: {
      photoStorageKey: pending.storageKey,
      photoContentType: pending.contentType,
    },
  });
}
