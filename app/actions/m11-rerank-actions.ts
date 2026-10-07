"use server";

import { AuthenticationError, AuthorizationError } from "@/lib/auth/authorization";
import { M11RerankError } from "@/lib/rerank/m11-errors";
import { listM11HybridRuns, rerankM10ForAdmin } from "@/lib/rerank/m11-service";

export async function getM11HybridChoices(jobId: unknown) {
  return listM11HybridRuns(jobId);
}

export async function rerankM10Run(jobId: unknown, hybridRunId: unknown) {
  try {
    const result = await rerankM10ForAdmin(jobId, hybridRunId);
    return { ok: true as const, result };
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      throw error;
    }
    if (error instanceof M11RerankError) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }
}
