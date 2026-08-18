import {
  CandidateEvidenceOrigin,
  CandidateEvidenceSourceType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

const evidenceSelect = {
  id: true,
  companyId: true,
  candidateId: true,
  applicationId: true,
  sourceType: true,
  origin: true,
  ingestionEventId: true,
  hostedApplySubmissionId: true,
  actorUserId: true,
  inlineText: true,
  contentSha256: true,
  supersededById: true,
  revokedAt: true,
  createdAt: true,
  application: {
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      job: {
        select: {
          title: true,
        },
      },
    },
  },
} satisfies Prisma.CandidateEvidenceSelect;

export type CandidateEvidenceRow = Prisma.CandidateEvidenceGetPayload<{
  select: typeof evidenceSelect;
}>;

export async function findCandidateHandle(
  candidateId: number,
  db: Db = prisma,
) {
  return db.candidate.findFirst({
    where: { id: candidateId },
    select: {
      id: true,
      companyId: true,
    },
  });
}

export async function findCandidateHandleInCompany(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidate.findFirst({
    where: { id: candidateId, companyId },
    select: {
      id: true,
      companyId: true,
    },
  });
}

export async function findApplicationInCompany(
  applicationId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.application.findFirst({
    where: { id: applicationId, companyId },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
    },
  });
}

export async function listEvidenceForCandidate(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateEvidence.findMany({
    where: { candidateId, companyId },
    select: evidenceSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function getEvidenceInCompany(
  evidenceId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateEvidence.findFirst({
    where: { id: evidenceId, companyId },
    select: evidenceSelect,
  });
}

export async function findEvidenceByHostedApplySubmission(
  hostedApplySubmissionId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateEvidence.findFirst({
    where: { hostedApplySubmissionId, companyId },
    select: evidenceSelect,
  });
}

export async function listHostedApplyBackfillSources(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.applicationIngestionEvent.findMany({
    where: {
      candidateId,
      companyId,
      hostedApplySubmissionId: { not: null },
      applicationId: { not: null },
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
          coverLetter: true,
          createdAt: true,
        },
      },
      application: {
        select: {
          id: true,
          companyId: true,
          candidateId: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });
}

export async function createEvidence(
  data: {
    companyId: number;
    candidateId: number;
    applicationId: number | null;
    sourceType: CandidateEvidenceSourceType;
    origin: CandidateEvidenceOrigin;
    ingestionEventId: number | null;
    hostedApplySubmissionId: number | null;
    actorUserId: number | null;
    inlineText: string | null;
    contentSha256: string | null;
    createdAt?: Date;
  },
  db: Db = prisma,
) {
  try {
    return await db.candidateEvidence.create({
      data: {
        companyId: data.companyId,
        candidateId: data.candidateId,
        applicationId: data.applicationId,
        sourceType: data.sourceType,
        origin: data.origin,
        ingestionEventId: data.ingestionEventId,
        hostedApplySubmissionId: data.hostedApplySubmissionId,
        actorUserId: data.actorUserId,
        inlineText: data.inlineText,
        contentSha256: data.contentSha256,
        ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      },
      select: evidenceSelect,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      data.hostedApplySubmissionId
    ) {
      const existing = await findEvidenceByHostedApplySubmission(
        data.hostedApplySubmissionId,
        data.companyId,
        db,
      );
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

export async function revokeEvidence(
  evidenceId: number,
  companyId: number,
  redactInlineText: boolean,
  db: Db = prisma,
) {
  const existing = await getEvidenceInCompany(evidenceId, companyId, db);
  if (!existing) {
    return null;
  }
  if (existing.revokedAt) {
    return existing;
  }

  return db.candidateEvidence.update({
    where: { id: existing.id },
    data: {
      revokedAt: new Date(),
      ...(redactInlineText ? { inlineText: null } : {}),
    },
    select: evidenceSelect,
  });
}

export async function setSupersededBy(
  evidenceId: number,
  companyId: number,
  supersededById: number,
  db: Db = prisma,
) {
  const existing = await getEvidenceInCompany(evidenceId, companyId, db);
  if (!existing) {
    return null;
  }

  return db.candidateEvidence.update({
    where: { id: existing.id },
    data: { supersededById },
    select: evidenceSelect,
  });
}
