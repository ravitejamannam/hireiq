"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError } from "@/lib/auth/authorization";
import {
  getJobRanking as loadJobRanking,
  isCandidateRankingActionError,
  rankingActionErrorMessage,
  runJobRankingForAdmin,
} from "@/lib/candidates/ranking/ranking-service";

export async function getJobRanking(jobId: unknown) {
  return loadJobRanking(jobId);
}

export async function runJobRanking(
  jobId: unknown,
  jobSpecificationVersionId: unknown,
) {
  try {
    const run = await runJobRankingForAdmin(jobId, jobSpecificationVersionId);
    revalidatePath("/dashboard/requirements");
    revalidatePath(`/dashboard/requirements/${run.jobId}`);
    return { ok: true as const, run };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (isCandidateRankingActionError(error)) {
      return {
        ok: false as const,
        error: rankingActionErrorMessage(error),
      };
    }
    throw error;
  }
}
