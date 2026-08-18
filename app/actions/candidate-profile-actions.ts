"use server";

import { revalidatePath } from "next/cache";

import {
  AuthenticationError,
  AuthorizationError,
} from "@/lib/auth/authorization";
import {
  getCandidateProfilePageData,
  getOrMaterializeCandidateProfile,
  isCandidateProfileUserError,
  updateCandidateProfileForAdmin,
} from "@/lib/candidates/candidate-profile-service";
import { CandidateProfileValidationError } from "@/lib/validation/candidate-profile-validation";

export async function getCandidateProfile(candidateId: unknown) {
  return getOrMaterializeCandidateProfile(candidateId);
}

export async function updateCandidateProfile(
  candidateId: unknown,
  input: unknown,
) {
  try {
    const profile = await updateCandidateProfileForAdmin(candidateId, input);
    revalidatePath("/dashboard/candidates");
    revalidatePath(`/dashboard/candidates/${profile.candidateId}`);
    return { ok: true as const, profile };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (isCandidateProfileUserError(error)) {
      return {
        ok: false as const,
        error:
          error instanceof CandidateProfileValidationError
            ? error.message
            : "Resource not found.",
      };
    }
    if (error instanceof AuthorizationError) {
      return { ok: false as const, error: "Resource not found." };
    }
    throw error;
  }
}

export { getCandidateProfilePageData };
