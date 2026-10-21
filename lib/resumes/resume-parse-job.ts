import {
  CandidateEvidenceOrigin,
  CandidateEvidenceSourceType,
  HostedResumeParseStatus,
  ResumeParseStatus,
} from "@prisma/client";

import { hashEvidenceInlineTextOrNull } from "@/lib/candidates/evidence/evidence-hash";
import { createEvidence } from "@/lib/repositories/candidate-evidence-repository";
import { prisma } from "@/lib/prisma";
import { withCandidateWriteGuard } from "@/lib/privacy/erasure-guard";
import { resumeAiAllowed, type ResumeVisionAudit } from "@/lib/resumes/layout-vision";
import { analyseParsedCandidate } from "@/lib/resumes/analyse-after-parse";
import { proposeResumeFieldsDetailed, suggestionFromFields } from "@/lib/resumes/resume-field-extractor";
import { readResume } from "@/lib/resumes/storage";
import { extractResumeText, RESUME_TEXT_EXTRACTOR_VERSION } from "@/lib/resumes/text-extraction";

export function clientParseStatus(status: string): "PARSING" | "READY" | "FAILED" {
  if (status === "FAILED") return "FAILED";
  if (status === "PARSING" || status === "PENDING") return "PARSING";
  return "READY";
}

export function resumeParseIsReady(status: string) {
  return status === "PARSED" || status === "READY";
}

async function candidateIsErased(candidateId: number, companyId: number) {
  const row = await prisma.candidate.findFirst({ where: { id: candidateId, companyId }, select: { erasedAt: true } });
  return Boolean(row?.erasedAt);
}

export async function finishHostedResumeParse(uploadId: number) {
  const pending = await prisma.hostedApplyResumeUpload.findUnique({ where: { id: uploadId } });
  if (!pending || pending.parseStatus !== HostedResumeParseStatus.PARSING) return;
  const bytes = await readResume(pending.storageKey);
  if (!bytes) {
    await prisma.hostedApplyResumeUpload.update({
      where: { id: uploadId },
      data: { parseStatus: HostedResumeParseStatus.FAILED, parseErrorCode: "FILE_MISSING" },
    });
    return;
  }
  const extraction = await extractResumeText(bytes, {
    fileName: pending.fileName,
    contentType: pending.contentType,
    ocr: "skip",
    visionAudit: {
      companyId: pending.companyId,
      entityType: "HostedApplyResumeUpload",
      entityId: pending.id,
      db: prisma as unknown as ResumeVisionAudit["db"],
    },
  });
  if (!extraction.ok) {
    await prisma.hostedApplyResumeUpload.update({
      where: { id: uploadId },
      data: {
        parseStatus: HostedResumeParseStatus.FAILED,
        parseErrorCode: extraction.errorCode,
        fieldsNeedReview: true,
      },
    });
    await syncClaimedDocument(pending.storageKey, {
      parseStatus: ResumeParseStatus.FAILED,
      parseErrorCode: extraction.errorCode,
      fieldsNeedReview: true,
    });
    return;
  }
  // No application exists yet, so the candidate's AI preference is unknown: text extraction only, no field model.
  const parseErrorCode = extraction.quality.needsReview ? "LOW_QUALITY" : null;
  const stored = await prisma.hostedApplyResumeUpload.updateMany({
    // Erasure moves the row out of PARSING, so a late result is dropped instead of restoring erased text.
    where: { id: uploadId, parseStatus: HostedResumeParseStatus.PARSING },
    data: {
      parseStatus: HostedResumeParseStatus.READY,
      extractedText: extraction.text,
      extractorVersion: RESUME_TEXT_EXTRACTOR_VERSION,
      parseErrorCode,
      fieldsNeedReview: false,
    },
  });
  if (stored.count === 0) return;
  await syncClaimedDocument(pending.storageKey, {
    parseStatus: ResumeParseStatus.READY,
    extractedText: extraction.text,
    extractorVersion: RESUME_TEXT_EXTRACTOR_VERSION,
    parseErrorCode,
    fieldsNeedReview: false,
  });
}

export async function finishCandidateResumeParse(documentId: number) {
  const document = await prisma.candidateResumeDocument.findUnique({ where: { id: documentId } });
  if (!document || document.parseStatus !== ResumeParseStatus.PARSING) return;
  if (await candidateIsErased(document.candidateId, document.companyId)) return;
  const bytes = await readResume(document.storageKey);
  if (!bytes) {
    await prisma.candidateResumeDocument.update({
      where: { id: documentId },
      data: { parseStatus: ResumeParseStatus.FAILED, parseErrorCode: "FILE_MISSING", fieldsNeedReview: true },
    });
    return;
  }
  const extraction = await extractResumeText(bytes, {
    fileName: document.fileName,
    contentType: document.contentType,
    ocr: "skip",
    visionAudit: {
      companyId: document.companyId,
      entityType: document.applicationId ? "Application" : "Candidate",
      entityId: document.applicationId ?? document.candidateId,
      applicationId: document.applicationId,
      candidateId: document.candidateId,
      db: prisma as unknown as ResumeVisionAudit["db"],
    },
  });
  if (!extraction.ok) {
    await prisma.candidateResumeDocument.update({
      where: { id: documentId },
      data: {
        parseStatus: ResumeParseStatus.FAILED,
        parseErrorCode: extraction.errorCode,
        fieldsNeedReview: true,
      },
    });
    return;
  }
  const allowed = await resumeAiAllowed(prisma as unknown as Parameters<typeof resumeAiAllowed>[0], document);
  const proposal = await proposeResumeFieldsDetailed(extraction.text, {
    optedOut: !allowed,
    subject: { applicationId: document.applicationId, candidateId: document.candidateId, companyId: document.companyId },
  });
  const needsReview = proposal.source !== "model";
  const suggestion = needsReview ? null : suggestionFromFields(proposal.fields);
  // One transaction holding the candidate lock: the result and its evidence are written together,
  // or not at all when the candidate was erased while the parse was running.
  const persisted = await withCandidateWriteGuard(document.candidateId, document.companyId, async (tx) => {
    const stored = await tx.candidateResumeDocument.updateMany({
      // Erasure moves the row out of PARSING, so a late result is dropped instead of restoring erased text.
      where: { id: documentId, parseStatus: ResumeParseStatus.PARSING },
      data: {
        parseStatus: ResumeParseStatus.READY,
        extractedText: extraction.text,
        extractorVersion: RESUME_TEXT_EXTRACTOR_VERSION,
        parseErrorCode: needsReview ? "NEEDS_REVIEW" : extraction.quality.needsReview ? "LOW_QUALITY" : null,
        fieldsNeedReview: needsReview,
        fieldSuggestion: suggestion === null ? undefined : (suggestion as object),
      },
    });
    if (stored.count === 0) return false;
    if (!needsReview && !extraction.quality.needsReview) {
      const existingEvidence = await tx.candidateEvidence.findFirst({
        where: {
          candidateId: document.candidateId,
          companyId: document.companyId,
          sourceType: CandidateEvidenceSourceType.RESUME_DOCUMENT,
          inlineText: extraction.text,
        },
        select: { id: true },
      });
      if (!existingEvidence) {
        await createEvidence(
          {
            companyId: document.companyId,
            candidateId: document.candidateId,
            applicationId: document.applicationId,
            sourceType: CandidateEvidenceSourceType.RESUME_DOCUMENT,
            origin: CandidateEvidenceOrigin.RECRUITER_ENTERED,
            ingestionEventId: null,
            hostedApplySubmissionId: null,
            actorUserId: document.uploadedByUserId,
            inlineText: extraction.text,
            contentSha256: hashEvidenceInlineTextOrNull(extraction.text),
            createdAt: document.createdAt,
          },
          tx,
        );
      }
    }
    return true;
  });
  if (!persisted.ok || !persisted.value) return;
  await analyseParsedCandidate({
    candidateId: document.candidateId,
    companyId: document.companyId,
    applicationId: document.applicationId,
  }).catch((error) => console.error("[analyse] after parse", error));
}

async function syncClaimedDocument(
  storageKey: string,
  data: {
    parseStatus: ResumeParseStatus;
    extractedText?: string;
    extractorVersion?: string;
    parseErrorCode: string | null;
    fieldsNeedReview: boolean;
    fieldSuggestion?: object;
  },
) {
  await prisma.candidateResumeDocument.updateMany({
    where: { storageKey },
    data,
  });
}
