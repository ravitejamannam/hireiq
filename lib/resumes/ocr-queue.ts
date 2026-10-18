import { prisma } from "@/lib/prisma";
import { readResume } from "@/lib/resumes/storage";
import type { ResumeVisionAudit } from "@/lib/resumes/layout-vision";
import {
  extractResumeText,
  RESUME_TEXT_EXTRACTOR_VERSION,
} from "@/lib/resumes/text-extraction";

export const OCR_MAX_ATTEMPTS = 3;
export const OCR_CLAIM_STALE_MS = 10 * 60 * 1000;

export function ocrFailureCode(attemptsAfterClaim: number): "OCR_DEFERRED" | "OCR_EXHAUSTED" {
  return attemptsAfterClaim >= OCR_MAX_ATTEMPTS ? "OCR_EXHAUSTED" : "OCR_DEFERRED";
}

type OcrRow = {
  id: number;
  storageKey: string;
  fileName: string;
  contentType: string;
  ocrAttempts: number;
  parseErrorCode: string | null;
  ocrClaimedAt: Date | null;
};

function claimWhere(now: Date) {
  const staleBefore = new Date(now.getTime() - OCR_CLAIM_STALE_MS);
  return {
    ocrAttempts: { lt: OCR_MAX_ATTEMPTS },
    OR: [
      { parseErrorCode: "OCR_DEFERRED" },
      { parseErrorCode: "OCR_CLAIMED", ocrClaimedAt: { lt: staleBefore } },
    ],
  };
}

type FinishData = {
  parseStatus: "PARSED" | "FAILED";
  extractedText?: string | null;
  parseErrorCode: string | null;
  extractorVersion: string | null;
};

type OcrTable = {
  findMany(args: {
    where: ReturnType<typeof claimWhere>;
    orderBy: { id: "asc" };
    take: number;
    select: {
      id: true;
      storageKey: true;
      fileName: true;
      contentType: true;
      ocrAttempts: true;
      parseErrorCode: true;
      ocrClaimedAt: true;
    };
  }): Promise<OcrRow[]>;
  updateMany(args: {
    where:
      | { id: number; parseErrorCode: "OCR_DEFERRED"; ocrAttempts: number }
      | { id: number; parseErrorCode: "OCR_CLAIMED"; ocrClaimedAt: Date | null };
    data: {
      parseErrorCode: "OCR_CLAIMED";
      ocrClaimedAt: Date;
      ocrAttempts: { increment: 1 };
    };
  }): Promise<{ count: number }>;
  update(args: {
    where: { id: number };
    data: FinishData & { ocrClaimedAt: null };
  }): Promise<unknown>;
};

const resumeDocuments: OcrTable = {
  findMany: (args) => prisma.candidateResumeDocument.findMany(args),
  updateMany: (args) => prisma.candidateResumeDocument.updateMany(args),
  update: (args) => prisma.candidateResumeDocument.update(args),
};

const hostedUploads: OcrTable = {
  findMany: (args) => prisma.hostedApplyResumeUpload.findMany(args),
  updateMany: (args) => prisma.hostedApplyResumeUpload.updateMany(args),
  update: (args) => prisma.hostedApplyResumeUpload.update(args),
};

async function claimRow(table: OcrTable, row: OcrRow, now: Date): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - OCR_CLAIM_STALE_MS);
  const staleClaim = row.parseErrorCode === "OCR_CLAIMED" && row.ocrClaimedAt !== null && row.ocrClaimedAt < staleBefore;
  const waiting = row.parseErrorCode === "OCR_DEFERRED";
  if (!waiting && !staleClaim) return false;
  const claimed = await table.updateMany({
    where: waiting
      ? { id: row.id, parseErrorCode: "OCR_DEFERRED", ocrAttempts: row.ocrAttempts }
      : { id: row.id, parseErrorCode: "OCR_CLAIMED", ocrClaimedAt: row.ocrClaimedAt },
    data: {
      parseErrorCode: "OCR_CLAIMED",
      ocrClaimedAt: now,
      ocrAttempts: { increment: 1 },
    },
  });
  return claimed.count === 1;
}

async function finishRow(table: OcrTable, id: number, data: FinishData) {
  await table.update({
    where: { id },
    data: {
      ...data,
      ocrClaimedAt: null,
    },
  });
}

async function drainTable(
  table: OcrTable,
  limit: number,
  visionAuditFor?: (
    row: OcrRow,
  ) => Promise<Omit<ResumeVisionAudit, "pageCount" | "pageIndex"> | null>,
): Promise<{ read: number; unread: number; exhausted: number; claimed: number }> {
  const now = new Date();
  const rows = await table.findMany({
    where: claimWhere(now),
    orderBy: { id: "asc" },
    take: limit,
    select: {
      id: true,
      storageKey: true,
      fileName: true,
      contentType: true,
      ocrAttempts: true,
      parseErrorCode: true,
      ocrClaimedAt: true,
    },
  });

  let read = 0;
  let unread = 0;
  let exhausted = 0;
  let claimed = 0;
  for (const row of rows) {
    const won = await claimRow(table, row, now);
    if (!won) continue;
    claimed += 1;
    const attempts = row.ocrAttempts + 1;
    const bytes = await readResume(row.storageKey);
    const visionAudit = visionAuditFor ? await visionAuditFor(row) : null;
    const extraction = bytes
      ? await extractResumeText(bytes, {
          fileName: row.fileName,
          contentType: row.contentType,
          ocr: "inline",
          visionAudit,
        })
      : null;
    if (!extraction || !extraction.ok) {
      const code = ocrFailureCode(attempts);
      await finishRow(table, row.id, {
        parseStatus: "FAILED",
        parseErrorCode: code === "OCR_DEFERRED" ? "OCR_DEFERRED" : "OCR_EXHAUSTED",
        extractorVersion: RESUME_TEXT_EXTRACTOR_VERSION,
      });
      if (code === "OCR_EXHAUSTED") exhausted += 1;
      else unread += 1;
      continue;
    }
    await finishRow(table, row.id, {
      parseStatus: "PARSED",
      extractedText: extraction.text,
      parseErrorCode: extraction.quality.needsReview ? "LOW_QUALITY" : null,
      extractorVersion: RESUME_TEXT_EXTRACTOR_VERSION,
    });
    read += 1;
  }
  return { read, unread, exhausted, claimed };
}

/** Claim and read until the deadline or the queue is empty. */
export async function processPendingResumeOcr(limitOrDeadline: number | { deadlineAt: number } = 1) {
  const deadlineAt =
    typeof limitOrDeadline === "number"
      ? Date.now() + 45_000
      : limitOrDeadline.deadlineAt;
  const totals = {
    read: 0,
    unread: 0,
    exhausted: 0,
    claimed: 0,
    documents: { read: 0, unread: 0, exhausted: 0, claimed: 0 },
    hosted: { read: 0, unread: 0, exhausted: 0, claimed: 0 },
  };
  while (Date.now() < deadlineAt) {
    const [documents, hosted] = await Promise.all([
      drainTable(resumeDocuments, 1, async (row) => {
        const doc = await prisma.candidateResumeDocument.findUnique({
          where: { id: row.id },
          select: { companyId: true, applicationId: true },
        });
        if (!doc) return null;
        return {
          companyId: doc.companyId,
          entityType: doc.applicationId ? "Application" : "CandidateResumeDocument",
          entityId: doc.applicationId ?? row.id,
          applicationId: doc.applicationId,
          db: prisma as unknown as ResumeVisionAudit["db"],
        };
      }),
      drainTable(hostedUploads, 1, async (row) => {
        const upload = await prisma.hostedApplyResumeUpload.findUnique({
          where: { id: row.id },
          select: { companyId: true },
        });
        if (!upload) return null;
        return {
          companyId: upload.companyId,
          entityType: "HostedApplyResumeUpload",
          entityId: row.id,
          db: prisma as unknown as ResumeVisionAudit["db"],
        };
      }),
    ]);
    for (const key of ["read", "unread", "exhausted", "claimed"] as const) {
      totals[key] += documents[key] + hosted[key];
      totals.documents[key] += documents[key];
      totals.hosted[key] += hosted[key];
    }
    if (documents.claimed + hosted.claimed === 0) break;
  }
  console.info(JSON.stringify({ event: "resume_ocr_job", ...totals }));
  return totals;
}
