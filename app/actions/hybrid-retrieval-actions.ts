"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError } from "@/lib/auth/authorization";
import {
  getHybridRetrieval as loadHybridRetrieval,
  hybridRetrievalActionErrorMessage,
  isHybridRetrievalActionError,
  runHybridRetrievalForAdmin,
} from "@/lib/retrieval/hybrid-retrieval-service";

export async function getHybridRetrieval(jobId: unknown) {
  return loadHybridRetrieval(jobId);
}

export async function runHybridRetrieval(
  jobId: unknown,
  lexicalRunId: unknown,
  semanticRunId: unknown,
  limit?: unknown,
) {
  try {
    const run = await runHybridRetrievalForAdmin(
      jobId,
      lexicalRunId,
      semanticRunId,
      limit,
    );
    revalidatePath(`/dashboard/requirements/${run.jobId}`);
    return { ok: true as const, run };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (isHybridRetrievalActionError(error)) {
      return { ok: false as const, error: hybridRetrievalActionErrorMessage(error) };
    }
    throw error;
  }
}
