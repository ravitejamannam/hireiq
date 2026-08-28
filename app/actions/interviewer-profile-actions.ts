"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError, AuthorizationError } from "@/lib/auth/authorization";
import {
  getInterviewerOwnProfile,
  isInterviewerProfileUserError,
  InterviewerProfileValidationError,
  updateInterviewerOwnProfile,
} from "@/lib/interviewers/interviewer-profile-service";

export async function saveInterviewerProfile(input: unknown) {
  try {
    const profile = await updateInterviewerOwnProfile(input);
    revalidatePath("/interviewer/profile");
    revalidatePath("/interviewer/profile/edit");
    revalidatePath("/interviewer");
    revalidatePath("/dashboard/interviewers");
    revalidatePath(`/dashboard/interviewers/${profile.interviewerId}`);
    return { ok: true as const, profile };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    if (isInterviewerProfileUserError(error)) {
      return {
        ok: false as const,
        error:
          error instanceof InterviewerProfileValidationError
            ? error.message
            : "Resource not found.",
        fields:
          error instanceof InterviewerProfileValidationError ? error.fields : undefined,
      };
    }
    if (error instanceof AuthorizationError) {
      return { ok: false as const, error: "Resource not found." };
    }
    throw error;
  }
}

export { getInterviewerOwnProfile };
