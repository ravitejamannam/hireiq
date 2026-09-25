"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError } from "@/lib/auth/authorization";
import {
  getRequirementExplanation as loadRequirementExplanation,
  isMatcherV2ActionError,
  matcherV2ActionErrorMessage,
  runRequirementExplanationForJobAdmin,
} from "@/lib/candidates/matching/matching-v2-service";

export async function getRequirementExplanation(jobId: unknown) {
  return loadRequirementExplanation(jobId);
}

export async function runRequirementExplanation(
  jobId: unknown,
  jobSpecificationVersionId: unknown,
) {
  try {
    const page = await runRequirementExplanationForJobAdmin(
      jobId,
      jobSpecificationVersionId,
    );
    revalidatePath(`/dashboard/requirements/${page.jobId}`);
    return { ok: true as const, page };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (isMatcherV2ActionError(error)) {
      return {
        ok: false as const,
        error: matcherV2ActionErrorMessage(error),
      };
    }
    throw error;
  }
}
