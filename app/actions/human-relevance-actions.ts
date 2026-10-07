"use server";

import { PortalRole } from "@prisma/client";

import {
  AuthenticationError,
  AuthorizationError,
  requireClientPortal,
} from "@/lib/auth/authorization";
import { HumanRelevanceError } from "@/lib/relevance/human-relevance-errors";
import { createHumanRelevanceJudgment } from "@/lib/relevance/human-relevance-operations";
import { canCreateHumanRelevanceJudgment } from "@/lib/validation/human-relevance-validation";

export async function createRelevanceJudgment(input: {
  applicationId: number;
  jobSpecificationVersionId: number;
  label: unknown;
  idempotencyKey: unknown;
  supersedesJudgmentId?: number | null;
}) {
  try {
    const client = await requireClientPortal();
    if (!canCreateHumanRelevanceJudgment(client.role ?? PortalRole.CLIENT)) {
      throw new AuthorizationError("Resource not found.");
    }
    const judgment = await createHumanRelevanceJudgment({
      reviewerUserId: client.id,
      role: PortalRole.CLIENT,
      companyId: client.companyId,
      applicationId: input.applicationId,
      jobSpecificationVersionId: input.jobSpecificationVersionId,
      label: input.label,
      idempotencyKey: input.idempotencyKey,
      supersedesJudgmentId: input.supersedesJudgmentId,
      forbidden: input,
    });
    return { ok: true as const, judgment };
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      throw error;
    }
    if (error instanceof HumanRelevanceError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }
}
