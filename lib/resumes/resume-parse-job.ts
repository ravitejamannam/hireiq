import {
  CandidateEvidenceOrigin,
  CandidateEvidenceSourceType,
  HostedResumeParseStatus,
  ResumeParseStatus,
} from "@prisma/client";

import { hashEvidenceInlineTextOrNull } from "@/lib/candidates/evidence/evidence-hash";
import { createEvidence } from "@/lib/repositories/candidate-evidence-repository";
import { prisma } from "@/lib/prisma";
import type { ResumeVisionAudit } from "@/lib/resumes/layout-vision";
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
      entityType: "Job",
      entityId: pending.jobId,
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
  const proposal = await proposeResumeFieldsDetailed(extraction.text, { optedOut: false });
  const needsReview = proposal.source !== "model";
  const suggestion = needsReview ? null : suggestionFromFields(proposal.fields);
  await prisma.hostedApplyResumeUpload.update({
    where: { id: uploadId },
    data: {
      parseStatus: HostedResumeParseStatus.READY,
      extractedText: extraction.text,
      extractorVersion: RESUME_TEXT_EXTRACTOR_VERSION,
      parseErrorCode: needsReview ? "NEEDS_REVIEW" : extraction.quality.needsReview ? "LOW_QUALITY" : null,
      fieldsNeedReview: needsReview,
      fieldSuggestion: suggestion === null ? undefined : (suggestion as object),
    },
  });
  await syncClaimedDocument(pending.storageKey, {
    parseStatus: ResumeParseStatus.READY,
    extractedText: extraction.text,
    extractorVersion: RESUME_TEXT_EXTRACTOR_VERSION,
    parseErrorCode: needsReview ? "NEEDS_REVIEW" : extraction.quality.needsReview ? "LOW_QUALITY" : null,
    fieldsNeedReview: needsReview,
    fieldSuggestion: suggestion ?? undefined,
  });
}

export async function finishCandidateResumeParse(documentId: number) {
  const document = await prisma.candidateResumeDocument.findUnique({ where: { id: documentId } });
  if (!document || document.parseStatus !== ResumeParseStatus.PARSING) return;
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
  const proposal = await proposeResumeFieldsDetailed(extraction.text, { optedOut: false });
  const needsReview = proposal.source !== "model";
  const suggestion = needsReview ? null : suggestionFromFields(proposal.fields);
  await prisma.candidateResumeDocument.update({
    where: { id: documentId },
    data: {
      parseStatus: ResumeParseStatus.READY,
      extractedText: extraction.text,
      extractorVersion: RESUME_TEXT_EXTRACTOR_VERSION,
      parseErrorCode: needsReview ? "NEEDS_REVIEW" : extraction.quality.needsReview ? "LOW_QUALITY" : null,
      fieldsNeedReview: needsReview,
      fieldSuggestion: suggestion === null ? undefined : (suggestion as object),
    },
  });
  if (!needsReview && !extraction.quality.needsReview) {
    const existingEvidence = await prisma.candidateEvidence.findFirst({
      where: {
        candidateId: document.candidateId,
        companyId: document.companyId,
        sourceType: CandidateEvidenceSourceType.RESUME_DOCUMENT,
        inlineText: extraction.text,
      },
      select: { id: true },
    });
    if (!existingEvidence) {
      await createEvidence({
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
      });
    }
  }
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
