"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError } from "@/lib/auth/authorization";
import {
  getEvidenceGraph as loadEvidenceGraph,
  isEvidenceGraphActionError,
  evidenceGraphActionErrorMessage,
  materializeEvidenceGraphForAdmin,
} from "@/lib/evidence-graph/evidence-graph-service";

export async function getEvidenceGraph(jobId: unknown) {
  return loadEvidenceGraph(jobId);
}

export async function materializeEvidenceGraph(
  jobId: unknown,
  jobSpecificationVersionId: unknown,
) {
  try {
    const runs = await materializeEvidenceGraphForAdmin(
      jobId,
      jobSpecificationVersionId,
    );
    const jobIdValue = runs[0]?.jobId;
    if (jobIdValue) {
      revalidatePath(`/dashboard/requirements/${jobIdValue}`);
    }
    return { ok: true as const, runs };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (isEvidenceGraphActionError(error)) {
      return {
        ok: false as const,
        error: evidenceGraphActionErrorMessage(error),
      };
    }
    throw error;
  }
}
