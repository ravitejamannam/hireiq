"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError } from "@/lib/auth/authorization";
import {
  getSemanticRetrieval as loadSemanticRetrieval,
  isSemanticRetrievalActionError,
  runSemanticRetrievalForAdmin,
  semanticRetrievalActionErrorMessage,
} from "@/lib/retrieval/semantic-retrieval-service";

export async function getSemanticRetrieval(jobId: unknown) {
  return loadSemanticRetrieval(jobId);
}

export async function runSemanticRetrieval(
  jobId: unknown,
  jobSpecificationVersionId: unknown,
  limit?: unknown,
) {
  try {
    const run = await runSemanticRetrievalForAdmin(
      jobId,
      jobSpecificationVersionId,
      limit,
    );
    revalidatePath(`/dashboard/requirements/${run.jobId}`);
    return { ok: true as const, run };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (isSemanticRetrievalActionError(error)) {
      return {
        ok: false as const,
        error: semanticRetrievalActionErrorMessage(error),
      };
    }
    throw error;
  }
}
