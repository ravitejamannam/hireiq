import { PortalRole } from "@prisma/client";

import {
  AuthorizationError,
  requireAdmin,
  requireClientPortal,
} from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import {
  HUMAN_RELEVANCE_NOT_FOUND,
  HumanRelevanceError,
} from "@/lib/relevance/human-relevance-errors";
import { createHumanRelevanceJudgment } from "@/lib/relevance/human-relevance-operations";
import { canReadHumanRelevanceJudgments } from "@/lib/validation/human-relevance-validation";

const judgmentSelect = {
  id: true,
  companyId: true,
  jobId: true,
  applicationId: true,
  candidateId: true,
  jobSpecificationVersionId: true,
  reviewerUserId: true,
  protocolVersion: true,
  label: true,
  idempotencyKey: true,
  supersededById: true,
  createdAt: true,
  evidenceRefs: {
    select: { evidenceId: true, contentSha256: true },
  },
} as const;

export async function createHumanRelevanceJudgmentForClient(input: {
  applicationId: number;
  jobSpecificationVersionId: number;
  label: unknown;
  idempotencyKey: unknown;
  supersedesJudgmentId?: number | null;
  forbidden?: unknown;
}) {
  const client = await requireClientPortal();
  return createHumanRelevanceJudgment({
    reviewerUserId: client.id,
    role: PortalRole.CLIENT,
    companyId: client.companyId,
    ...input,
  });
}

export async function listHumanRelevanceJudgmentsForClient(applicationId: number) {
  const client = await requireClientPortal();
  if (!canReadHumanRelevanceJudgments(client.role)) {
    throw new AuthorizationError("Resource not found.");
  }
  const application = await prisma.application.findFirst({
    where: { id: applicationId, job: { companyId: client.companyId } },
    select: { id: true },
  });
  if (!application) {
    throw new HumanRelevanceError("Application was not found.", HUMAN_RELEVANCE_NOT_FOUND);
  }
  return prisma.humanRelevanceJudgment.findMany({
    where: {
      companyId: client.companyId,
      applicationId,
      reviewerUserId: client.id,
    },
    select: judgmentSelect,
    orderBy: { id: "asc" },
  });
}

export async function listHumanRelevanceJudgmentsForAdminCandidate(candidateId: number) {
  await requireAdmin();
  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId },
    select: { id: true, companyId: true },
  });
  if (!candidate) {
    return [];
  }
  return prisma.humanRelevanceJudgment.findMany({
    where: { companyId: candidate.companyId, candidateId: candidate.id },
    select: {
      id: true,
      applicationId: true,
      label: true,
      protocolVersion: true,
      createdAt: true,
      supersededById: true,
    },
    orderBy: { id: "asc" },
  });
}

export { createHumanRelevanceJudgment };
