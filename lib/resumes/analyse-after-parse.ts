import { CandidateEvidenceSourceType, ResumeParseStatus } from "@prisma/client";

import { executeRunDeterministicIntelligence } from "@/lib/candidates/intelligence/deterministic-intelligence-service";
import { executeRunCandidateMatching } from "@/lib/candidates/matching/matching-service";
import { createEvidence } from "@/lib/repositories/candidate-evidence-repository";
import { hashEvidenceInlineTextOrNull } from "@/lib/candidates/evidence/evidence-hash";
import { CandidateEvidenceOrigin } from "@prisma/client";
import { AiEvaluationOptOutError } from "@/lib/ai/opt-out";
import { prisma } from "@/lib/prisma";

/**
 * Turn a successfully parsed resume into skill claims, then match the
 * candidate's applications. Missing claims must not look like a 0% match.
 */
export async function analyseParsedCandidate(input: {
  candidateId: number;
  companyId: number;
  applicationId?: number | null;
}) {
  const evidence = await ensureResumeEvidence(input);
  if (!evidence) return { analysed: false as const };

  try {
    await executeRunDeterministicIntelligence({
      candidateId: evidence.candidateId,
      evidenceId: evidence.id,
    });
  } catch (error) {
    if (error instanceof AiEvaluationOptOutError) return { analysed: false as const };
    throw error;
  }

  const applications = input.applicationId
    ? await prisma.application.findMany({
        where: { id: input.applicationId, candidateId: input.candidateId, companyId: input.companyId },
        select: { id: true, jobId: true },
      })
    : await prisma.application.findMany({
        where: { candidateId: input.candidateId, companyId: input.companyId },
        select: { id: true, jobId: true },
      });

  for (const application of applications) {
    const job = await prisma.job.findUnique({
      where: { id: application.jobId },
      select: { currentPublishedSpecificationVersionId: true },
    });
    const published =
      job?.currentPublishedSpecificationVersionId ??
      (
        await prisma.jobSpecificationVersion.findFirst({
          where: { jobId: application.jobId, status: "PUBLISHED" },
          orderBy: { versionNumber: "desc" },
          select: { id: true },
        })
      )?.id;
    if (!published) continue;
    try {
      await executeRunCandidateMatching({
        applicationId: application.id,
        jobSpecificationVersionId: published,
      });
    } catch (error) {
      console.error("[analyse] matching failed", { applicationId: application.id, error });
    }
  }

  return { analysed: true as const };
}

async function ensureResumeEvidence(input: {
  candidateId: number;
  companyId: number;
  applicationId?: number | null;
}) {
  const existing = await prisma.candidateEvidence.findFirst({
    where: {
      candidateId: input.candidateId,
      companyId: input.companyId,
      revokedAt: null,
      supersededById: null,
      sourceType: CandidateEvidenceSourceType.RESUME_DOCUMENT,
      inlineText: { not: "" },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, candidateId: true, inlineText: true },
  });
  if (existing?.inlineText?.trim()) return existing;

  const document = await prisma.candidateResumeDocument.findFirst({
    where: {
      candidateId: input.candidateId,
      companyId: input.companyId,
      parseStatus: ResumeParseStatus.PARSED,
      parseErrorCode: null,
      extractedText: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!document?.extractedText?.trim()) return null;

  return createEvidence({
    companyId: input.companyId,
    candidateId: input.candidateId,
    applicationId: input.applicationId ?? document.applicationId,
    sourceType: CandidateEvidenceSourceType.RESUME_DOCUMENT,
    origin: CandidateEvidenceOrigin.RECRUITER_ENTERED,
    ingestionEventId: null,
    hostedApplySubmissionId: null,
    actorUserId: null,
    inlineText: document.extractedText,
    contentSha256: hashEvidenceInlineTextOrNull(document.extractedText),
    createdAt: document.createdAt,
  });
}

export async function backfillUnanalysedResumes() {
  const documents = await prisma.candidateResumeDocument.findMany({
    where: {
      parseStatus: ResumeParseStatus.PARSED,
      parseErrorCode: null,
      extractedText: { not: null },
      candidate: { intelligenceClaims: { none: { claimType: "SKILL" } } },
    },
    select: { candidateId: true, companyId: true, applicationId: true },
    take: 500,
  });
  let analysed = 0;
  for (const document of documents) {
    const result = await analyseParsedCandidate(document);
    if (result.analysed) analysed += 1;
  }
  return { considered: documents.length, analysed };
}
