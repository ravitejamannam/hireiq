"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError } from "@/lib/auth/authorization";
import {
  evidenceActionErrorMessage,
  getCandidateEvidence as loadCandidateEvidence,
  isCandidateEvidenceActionError,
  revokeCandidateEvidence as revokeCandidateEvidenceForAdmin,
} from "@/lib/candidates/evidence/evidence-service";

export async function getCandidateEvidence(candidateId: unknown) {
  return loadCandidateEvidence(candidateId);
}

export async function revokeCandidateEvidence(evidenceId: unknown) {
  try {
    const result = await revokeCandidateEvidenceForAdmin(evidenceId);
    revalidatePath("/dashboard/candidates");
    revalidatePath(`/dashboard/candidates/${result.candidateId}`);
    return { ok: true as const, evidence: result };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (isCandidateEvidenceActionError(error)) {
      return {
        ok: false as const,
        error: evidenceActionErrorMessage(error),
      };
    }
    throw error;
  }
}
