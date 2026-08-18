"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError } from "@/lib/auth/authorization";
import {
  CandidateIdentityError,
  IDENTITY_GROUP_CONFLICT_CODE,
} from "@/lib/candidates/identity/identity-errors";
import {
  findPossibleCandidateDuplicates,
  getCandidateIdentity as loadCandidateIdentity,
  identityActionErrorMessage,
  isCandidateIdentityActionError,
  linkCandidates as linkCandidatesForAdmin,
  unlinkCandidate as unlinkCandidateForAdmin,
} from "@/lib/candidates/identity/identity-service";
import { CandidateIdentityValidationError } from "@/lib/validation/candidate-identity-validation";

export async function getCandidateIdentity(candidateId: unknown) {
  return loadCandidateIdentity(candidateId);
}

export async function findPossibleCandidateDuplicatesAction(
  candidateId: unknown,
) {
  return findPossibleCandidateDuplicates(candidateId);
}

export async function linkCandidates(
  leftCandidateId: unknown,
  rightCandidateId: unknown,
) {
  try {
    const result = await linkCandidatesForAdmin(
      leftCandidateId,
      rightCandidateId,
    );
    revalidatePath("/dashboard/candidates");
    revalidatePath(`/dashboard/candidates/${String(leftCandidateId)}`);
    revalidatePath(`/dashboard/candidates/${String(rightCandidateId)}`);
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (isCandidateIdentityActionError(error)) {
      return {
        ok: false as const,
        error: identityActionErrorMessage(error),
        code:
          error instanceof CandidateIdentityError ||
          error instanceof CandidateIdentityValidationError
            ? error.code
            : "IDENTITY_DENIED",
        conflict: error instanceof CandidateIdentityError
          ? error.code === IDENTITY_GROUP_CONFLICT_CODE
          : false,
      };
    }
    throw error;
  }
}

export async function unlinkCandidate(candidateId: unknown) {
  try {
    const result = await unlinkCandidateForAdmin(candidateId);
    revalidatePath("/dashboard/candidates");
    revalidatePath(`/dashboard/candidates/${String(candidateId)}`);
    return { ok: true as const, ...result };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (isCandidateIdentityActionError(error)) {
      return {
        ok: false as const,
        error: identityActionErrorMessage(error),
        code:
          error instanceof CandidateIdentityError ||
          error instanceof CandidateIdentityValidationError
            ? error.code
            : "IDENTITY_DENIED",
      };
    }
    throw error;
  }
}

export { findPossibleCandidateDuplicates };
