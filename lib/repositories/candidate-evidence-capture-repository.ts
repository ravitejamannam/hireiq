import {
  CandidateEvidenceSourceType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export async function getJobForCapture(jobId: number, db: Db = prisma) {
  return db.job.findFirst({
    where: { id: jobId },
    select: {
      id: true,
      companyId: true,
      title: true,
    },
  });
}

export async function getApplicationForCaptureInJob(
  applicationId: number,
  jobId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.application.findFirst({
    where: {
      id: applicationId,
      jobId,
      companyId,
    },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      jobId: true,
      status: true,
      expertScore: true,
    },
  });
}

export async function listApplicationsForJobCapture(
  jobId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.application.findMany({
    where: { jobId, companyId },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      jobId: true,
    },
    orderBy: { id: "asc" },
  });
}

export async function listJobHostedApplyCaptureSources(
  jobId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.applicationIngestionEvent.findMany({
    where: {
      jobId,
      companyId,
      hostedApplySubmissionId: { not: null },
      applicationId: { not: null },
      application: {
        jobId,
        companyId,
      },
    },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      applicationId: true,
      hostedApplySubmissionId: true,
      hostedApplySubmission: {
        select: {
          id: true,
          companyId: true,
          jobId: true,
          coverLetter: true,
          createdAt: true,
        },
      },
      application: {
        select: {
          id: true,
          companyId: true,
          candidateId: true,
          jobId: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });
}

export async function countEvidenceByApplicationForJob(
  jobId: number,
  companyId: number,
  applicationIds: number[],
  db: Db = prisma,
) {
  if (applicationIds.length === 0) {
    return [];
  }

  return db.candidateEvidence.groupBy({
    by: ["applicationId"],
    where: {
      companyId,
      applicationId: { in: applicationIds },
      application: {
        jobId,
        companyId,
      },
    },
    _count: {
      _all: true,
    },
  });
}

export async function findRecruiterEvidenceByContentHash(
  companyId: number,
  applicationId: number,
  contentSha256: string,
  db: Db = prisma,
) {
  return db.candidateEvidence.findFirst({
    where: {
      companyId,
      applicationId,
      contentSha256,
      sourceType: CandidateEvidenceSourceType.RECRUITER_ENTERED_TEXT,
      revokedAt: null,
      supersededById: null,
    },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      applicationId: true,
      sourceType: true,
      origin: true,
      contentSha256: true,
      createdAt: true,
      revokedAt: true,
      supersededById: true,
    },
  });
}
