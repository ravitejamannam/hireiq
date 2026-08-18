"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError } from "@/lib/auth/authorization";
import {
  generateCandidateIntelligenceForAdmin,
  getCandidateIntelligence as loadCandidateIntelligence,
  intelligenceActionErrorMessage,
  isCandidateIntelligenceActionError,
} from "@/lib/candidates/intelligence/intelligence-service";

export async function getCandidateIntelligence(candidateId: unknown) {
  return loadCandidateIntelligence(candidateId);
}

export async function generateCandidateIntelligence(
  candidateId: unknown,
  evidenceId: unknown,
) {
  try {
    const run = await generateCandidateIntelligenceForAdmin(
      candidateId,
      evidenceId,
    );
    revalidatePath("/dashboard/candidates");
    revalidatePath(`/dashboard/candidates/${run.candidateId}`);
    return { ok: true as const, run };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (isCandidateIntelligenceActionError(error)) {
      return {
        ok: false as const,
        error: intelligenceActionErrorMessage(error),
      };
    }
    throw error;
  }
}

export async function rerunCandidateIntelligence(
  candidateId: unknown,
  evidenceId: unknown,
) {
  return generateCandidateIntelligence(candidateId, evidenceId);
}
