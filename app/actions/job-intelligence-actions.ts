"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError } from "@/lib/auth/authorization";
import {
  getJobIntelligence as loadJobIntelligence,
  isJobIntelligenceActionError,
  jobIntelligenceActionErrorMessage,
  runJobIntelligenceForAdmin,
} from "@/lib/jobs/intelligence/job-intelligence-service";

export async function getJobIntelligence(jobId: unknown) {
  return loadJobIntelligence(jobId);
}

export async function runJobIntelligence(
  jobId: unknown,
  jobSpecificationVersionId: unknown,
) {
  try {
    const run = await runJobIntelligenceForAdmin(
      jobId,
      jobSpecificationVersionId,
    );
    revalidatePath(`/dashboard/requirements/${run.jobId}`);
    return { ok: true as const, run };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (isJobIntelligenceActionError(error)) {
      return {
        ok: false as const,
        error: jobIntelligenceActionErrorMessage(error),
      };
    }
    throw error;
  }
}
