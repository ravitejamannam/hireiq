import {
  ApplicationIngestionChannel,
  CandidateIdentityDecisionType,
  CandidateIdentitySignalKind,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { IdentityReasonCode } from "@/lib/validation/candidate-identity-validation";

type Db = Prisma.TransactionClient | typeof prisma;

const membershipSelect = {
  id: true,
  companyPersonId: true,
  candidateId: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CandidateIdentityMembershipSelect;

const signalSelect = {
  id: true,
  companyId: true,
  candidateId: true,
  kind: true,
  normalizedValue: true,
  sourceChannel: true,
  ingestionEventId: true,
  hostedApplySubmissionId: true,
  providerConnectionId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CandidateIdentitySignalSelect;

const decisionSelect = {
  id: true,
  companyId: true,
  decision: true,
  reasonCodes: true,
  leftCandidateId: true,
  rightCandidateId: true,
  actorUserId: true,
  createdAt: true,
} satisfies Prisma.CandidateIdentityDecisionSelect;

export type IdentityMembershipRow = Prisma.CandidateIdentityMembershipGetPayload<{
  select: typeof membershipSelect;
}>;

export type IdentitySignalRow = Prisma.CandidateIdentitySignalGetPayload<{
  select: typeof signalSelect;
}>;

export type IdentityDecisionRow = Prisma.CandidateIdentityDecisionGetPayload<{
  select: typeof decisionSelect;
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
      name: true,
      location: true,
      currentEmployer: true,
      experienceYears: true,
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
      name: true,
      location: true,
      currentEmployer: true,
      experienceYears: true,
    },
  });
}

export async function getMembership(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateIdentityMembership.findFirst({
    where: { candidateId, companyId },
    select: membershipSelect,
  });
}

export async function getMembershipsForCandidates(
  candidateIds: number[],
  companyId: number,
  db: Db = prisma,
) {
  if (candidateIds.length === 0) {
    return [];
  }
  return db.candidateIdentityMembership.findMany({
    where: {
      companyId,
      candidateId: { in: candidateIds },
    },
    select: membershipSelect,
  });
}

export async function getCompanyPersonForCandidate(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  const membership = await getMembership(candidateId, companyId, db);
  if (!membership) {
    return null;
  }

  return db.companyPerson.findFirst({
    where: {
      id: membership.companyPersonId,
      companyId,
    },
    select: {
      id: true,
      companyId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function listMembershipsForCompanyPerson(
  companyPersonId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateIdentityMembership.findMany({
    where: { companyPersonId, companyId },
    select: membershipSelect,
    orderBy: { candidateId: "asc" },
  });
}

export async function getSignalsForCandidate(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateIdentitySignal.findMany({
    where: { candidateId, companyId },
    select: signalSelect,
    orderBy: [{ kind: "asc" }, { id: "asc" }],
  });
}

export async function getIdentityDecisions(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateIdentityDecision.findMany({
    where: {
      companyId,
      OR: [{ leftCandidateId: candidateId }, { rightCandidateId: candidateId }],
    },
    select: decisionSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function listIngestionEventsForCandidate(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.applicationIngestionEvent.findMany({
    where: { candidateId, companyId },
    select: {
      id: true,
      companyId: true,
      candidateId: true,
      sourceChannel: true,
      applicantEmailNormalized: true,
      applicantPhone: true,
      applicantLinkedInUrl: true,
      externalCandidateId: true,
      hostedApplySubmissionId: true,
      distributionId: true,
      hostedApplySubmission: {
        select: {
          id: true,
          companyId: true,
          emailNormalized: true,
          phone: true,
          linkedInUrl: true,
        },
      },
      distribution: {
        select: {
          providerConnectionId: true,
        },
      },
    },
    orderBy: { id: "asc" },
  });
}

export async function findPossibleDuplicates(
  candidateId: number,
  companyId: number,
  signals: Array<{
    kind: CandidateIdentitySignalKind;
    normalizedValue: string;
  }>,
  db: Db = prisma,
) {
  if (signals.length === 0) {
    return [];
  }

  return db.candidateIdentitySignal.findMany({
    where: {
      companyId,
      candidateId: { not: candidateId },
      OR: signals.map((signal) => ({
        kind: signal.kind,
        normalizedValue: signal.normalizedValue,
      })),
    },
    select: {
      ...signalSelect,
      candidate: {
        select: {
          id: true,
          companyId: true,
          name: true,
          location: true,
          currentEmployer: true,
        },
      },
    },
    orderBy: { candidateId: "asc" },
  });
}

export async function createCompanyPerson(companyId: number, db: Db = prisma) {
  return db.companyPerson.create({
    data: { companyId },
    select: {
      id: true,
      companyId: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function addMembership(
  companyPersonId: number,
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateIdentityMembership.create({
    data: {
      companyPersonId,
      candidateId,
      companyId,
    },
    select: membershipSelect,
  });
}

export async function removeMembership(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  const existing = await getMembership(candidateId, companyId, db);
  if (!existing) {
    return null;
  }

  await db.candidateIdentityMembership.delete({
    where: { id: existing.id },
  });

  return existing;
}

export async function countMembershipsForCompanyPerson(
  companyPersonId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.candidateIdentityMembership.count({
    where: { companyPersonId, companyId },
  });
}

export async function deleteCompanyPersonIfEmpty(
  companyPersonId: number,
  companyId: number,
  db: Db = prisma,
) {
  const remaining = await countMembershipsForCompanyPerson(
    companyPersonId,
    companyId,
    db,
  );
  if (remaining > 0) {
    return false;
  }

  await db.companyPerson.delete({
    where: {
      id_companyId: {
        id: companyPersonId,
        companyId,
      },
    },
  });
  return true;
}

export async function createSignal(
  data: {
    companyId: number;
    candidateId: number;
    kind: CandidateIdentitySignalKind;
    normalizedValue: string;
    sourceChannel: ApplicationIngestionChannel | null;
    ingestionEventId: number | null;
    hostedApplySubmissionId: number | null;
    providerConnectionId: number | null;
  },
  db: Db = prisma,
) {
  try {
    return await db.candidateIdentitySignal.create({
      data: {
        companyId: data.companyId,
        candidateId: data.candidateId,
        kind: data.kind,
        normalizedValue: data.normalizedValue,
        sourceChannel: data.sourceChannel,
        ingestionEventId: data.ingestionEventId,
        hostedApplySubmissionId: data.hostedApplySubmissionId,
        providerConnectionId: data.providerConnectionId,
      },
      select: signalSelect,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return db.candidateIdentitySignal.findFirst({
        where: {
          companyId: data.companyId,
          candidateId: data.candidateId,
          kind: data.kind,
          normalizedValue: data.normalizedValue,
        },
        select: signalSelect,
      });
    }
    throw error;
  }
}

export async function createDecision(
  data: {
    companyId: number;
    decision: CandidateIdentityDecisionType;
    reasonCodes: IdentityReasonCode[];
    leftCandidateId: number;
    rightCandidateId: number;
    actorUserId: number | null;
  },
  db: Db = prisma,
) {
  return db.candidateIdentityDecision.create({
    data: {
      companyId: data.companyId,
      decision: data.decision,
      reasonCodes: data.reasonCodes,
      leftCandidateId: data.leftCandidateId,
      rightCandidateId: data.rightCandidateId,
      actorUserId: data.actorUserId,
    },
    select: decisionSelect,
  });
}

export async function countApplicationsForCandidate(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.application.count({
    where: { candidateId, companyId },
  });
}

export async function listApplicationIdsForCandidate(
  candidateId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.application.findMany({
    where: { candidateId, companyId },
    select: {
      id: true,
      candidateId: true,
      companyId: true,
      status: true,
      source: true,
    },
    orderBy: { id: "asc" },
  });
}

export async function findActorUserName(userId: number | null, db: Db = prisma) {
  if (!userId) {
    return null;
  }
  const user = await db.user.findFirst({
    where: { id: userId },
    select: { id: true, name: true },
  });
  return user;
}
