"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError } from "@/lib/auth/authorization";
import {
  getCandidateMatching as loadCandidateMatching,
  isCandidateMatchingActionError,
  matchingActionErrorMessage,
  runCandidateMatchingForAdmin,
} from "@/lib/candidates/matching/matching-service";

export async function getCandidateMatching(candidateId: unknown) {
  return loadCandidateMatching(candidateId);
}

export async function runCandidateMatching(
  applicationId: unknown,
  jobSpecificationVersionId: unknown,
) {
  try {
    const run = await runCandidateMatchingForAdmin(
      applicationId,
      jobSpecificationVersionId,
    );
    revalidatePath("/dashboard/candidates");
    revalidatePath(`/dashboard/candidates/${run.candidateId}`);
    return { ok: true as const, run };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (isCandidateMatchingActionError(error)) {
      return {
        ok: false as const,
        error: matchingActionErrorMessage(error),
      };
    }
    throw error;
  }
}
