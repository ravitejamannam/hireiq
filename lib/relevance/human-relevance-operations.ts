import { PortalRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  HUMAN_RELEVANCE_ALREADY_SUPERSEDED,
  HUMAN_RELEVANCE_FORBIDDEN,
  HUMAN_RELEVANCE_INVALID,
  HUMAN_RELEVANCE_NOT_FOUND,
  HUMAN_RELEVANCE_NO_EVIDENCE,
  HumanRelevanceError,
} from "@/lib/relevance/human-relevance-errors";
import { HUMAN_RELEVANCE_PROTOCOL_VERSION } from "@/lib/relevance/human-relevance-versions";
import {
  canCreateHumanRelevanceJudgment,
  parseHumanRelevanceLabel,
  parseIdempotencyKey,
  rejectForbiddenHumanRelevanceFields,
} from "@/lib/validation/human-relevance-validation";

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

export async function loadEligibleHumanEvidence(input: {
  companyId: number;
  applicationId: number;
  candidateId: number;
}) {
  return prisma.candidateEvidence.findMany({
    where: {
      companyId: input.companyId,
      revokedAt: null,
      supersededById: null,
      OR: [
        { applicationId: input.applicationId },
        { applicationId: null, candidateId: input.candidateId },
      ],
    },
    select: { id: true, contentSha256: true, inlineText: true },
    orderBy: { id: "asc" },
  });
}

export async function createHumanRelevanceJudgment(input: {
  reviewerUserId: number;
  role: PortalRole;
  companyId: number;
  applicationId: number;
  jobSpecificationVersionId: number;
  label: unknown;
  idempotencyKey: unknown;
  supersedesJudgmentId?: number | null;
  forbidden?: unknown;
}) {
  if (!canCreateHumanRelevanceJudgment(input.role)) {
    throw new HumanRelevanceError(
      "Only a client reviewer can record a relevance judgment.",
      HUMAN_RELEVANCE_FORBIDDEN,
    );
  }
  rejectForbiddenHumanRelevanceFields(input.forbidden);
  const label = parseHumanRelevanceLabel(input.label);
  const idempotencyKey = parseIdempotencyKey(input.idempotencyKey);

  const existing = await prisma.humanRelevanceJudgment.findUnique({
    where: { idempotencyKey },
    select: judgmentSelect,
  });
  if (existing) {
    if (existing.companyId !== input.companyId || existing.reviewerUserId !== input.reviewerUserId) {
      throw new HumanRelevanceError("Judgment was not found.", HUMAN_RELEVANCE_NOT_FOUND);
    }
    return existing;
  }

  const application = await prisma.application.findFirst({
    where: { id: input.applicationId, job: { companyId: input.companyId } },
    select: {
      id: true,
      status: true,
      candidateId: true,
      jobId: true,
      job: {
        select: {
          companyId: true,
          currentPublishedSpecificationVersionId: true,
        },
      },
    },
  });
  if (!application || application.job.companyId !== input.companyId) {
    throw new HumanRelevanceError("Application was not found.", HUMAN_RELEVANCE_NOT_FOUND);
  }
  if (application.job.currentPublishedSpecificationVersionId !== input.jobSpecificationVersionId) {
    throw new HumanRelevanceError(
      "Specification is not the published version for this job.",
      HUMAN_RELEVANCE_INVALID,
    );
  }

  const evidence = await loadEligibleHumanEvidence({
    companyId: input.companyId,
    applicationId: application.id,
    candidateId: application.candidateId,
  });
  if (evidence.length === 0) {
    throw new HumanRelevanceError(
      "No current evidence is available for this application.",
      HUMAN_RELEVANCE_NO_EVIDENCE,
    );
  }

  const statusBefore = application.status;

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (input.supersedesJudgmentId) {
        const prior = await tx.humanRelevanceJudgment.findFirst({
          where: { id: input.supersedesJudgmentId, companyId: input.companyId },
          select: { id: true, supersededById: true, applicationId: true },
        });
        if (!prior || prior.applicationId !== application.id) {
          throw new HumanRelevanceError("Judgment was not found.", HUMAN_RELEVANCE_NOT_FOUND);
        }
        if (prior.supersededById != null) {
          throw new HumanRelevanceError(
            "That judgment has already been superseded.",
            HUMAN_RELEVANCE_ALREADY_SUPERSEDED,
          );
        }
      }

      const judgment = await tx.humanRelevanceJudgment.create({
        data: {
          companyId: input.companyId,
          jobId: application.jobId,
          applicationId: application.id,
          candidateId: application.candidateId,
          jobSpecificationVersionId: input.jobSpecificationVersionId,
          reviewerUserId: input.reviewerUserId,
          protocolVersion: HUMAN_RELEVANCE_PROTOCOL_VERSION,
          label,
          idempotencyKey,
        },
        select: { id: true },
      });
      await tx.humanRelevanceJudgmentEvidence.createMany({
        data: evidence.map((row) => ({
          companyId: input.companyId,
          judgmentId: judgment.id,
          evidenceId: row.id,
          contentSha256: row.contentSha256,
        })),
      });
      const stored = await tx.humanRelevanceJudgment.findFirst({
        where: { id: judgment.id, companyId: input.companyId },
        select: judgmentSelect,
      });
      if (!stored) {
        throw new HumanRelevanceError("Judgment was not found.", HUMAN_RELEVANCE_NOT_FOUND);
      }

      if (input.supersedesJudgmentId) {
        const updated = await tx.humanRelevanceJudgment.updateMany({
          where: {
            id: input.supersedesJudgmentId,
            companyId: input.companyId,
            supersededById: null,
          },
          data: { supersededById: judgment.id },
        });
        if (updated.count !== 1) {
          throw new HumanRelevanceError(
            "That judgment has already been superseded.",
            HUMAN_RELEVANCE_ALREADY_SUPERSEDED,
          );
        }
      }
      return stored;
    });

    const after = await prisma.application.findFirst({
      where: { id: application.id },
      select: { status: true },
    });
    if (after?.status !== statusBefore) {
      throw new HumanRelevanceError(
        "Application status must not change.",
        HUMAN_RELEVANCE_INVALID,
      );
    }
    return created;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      const raced = await prisma.humanRelevanceJudgment.findUnique({
        where: { idempotencyKey },
        select: judgmentSelect,
      });
      if (raced && raced.companyId === input.companyId) {
        return raced;
      }
    }
    throw error;
  }
}

export async function loadHumanRelevanceCollection(input: {
  companyId: number;
  jobId: number;
  applicationId: number;
}) {
  const application = await prisma.application.findFirst({
    where: {
      id: input.applicationId,
      jobId: input.jobId,
      job: { companyId: input.companyId },
    },
    select: {
      id: true,
      candidateId: true,
      candidate: { select: { name: true } },
      job: {
        select: {
          id: true,
          title: true,
          companyId: true,
          currentPublishedSpecificationVersionId: true,
        },
      },
    },
  });
  if (!application?.job.currentPublishedSpecificationVersionId) {
    return null;
  }
  const spec = await prisma.jobSpecificationVersion.findFirst({
    where: {
      id: application.job.currentPublishedSpecificationVersionId,
      jobId: application.job.id,
      status: "PUBLISHED",
    },
    select: {
      id: true,
      title: true,
      primarySkills: true,
      mustHaveRequirements: true,
      jobDescription: true,
    },
  });
  if (!spec) {
    return null;
  }
  const evidence = await loadEligibleHumanEvidence({
    companyId: input.companyId,
    applicationId: application.id,
    candidateId: application.candidateId,
  });
  return {
    applicationId: application.id,
    candidateName: application.candidate.name,
    jobTitle: application.job.title,
    specificationId: spec.id,
    requirements: [spec.primarySkills, spec.mustHaveRequirements, spec.jobDescription].filter(
      (line): line is string => Boolean(line && line.trim()),
    ),
    evidence: evidence.map((row) => ({
      id: row.id,
      text: row.inlineText ?? "",
    })),
  };
}
