"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError } from "@/lib/auth/authorization";
import {
  attachRecruiterTextualEvidenceForAdmin,
  captureJobTextualEvidenceForAdmin,
  evidenceCaptureActionErrorMessage,
  getJobEvidenceCapture as loadJobEvidenceCapture,
  isEvidenceCaptureActionError,
} from "@/lib/candidates/evidence-capture/evidence-capture-service";

export async function getJobEvidenceCapture(jobId: unknown) {
  return loadJobEvidenceCapture(jobId);
}

export async function captureJobTextualEvidence(jobId: unknown) {
  try {
    const result = await captureJobTextualEvidenceForAdmin(jobId);
    revalidatePath("/dashboard/requirements");
    revalidatePath(`/dashboard/requirements/${result.jobId}`);
    return { ok: true as const, result };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (isEvidenceCaptureActionError(error)) {
      return {
        ok: false as const,
        error: evidenceCaptureActionErrorMessage(error),
      };
    }
    throw error;
  }
}

export async function attachRecruiterTextualEvidence(
  jobId: unknown,
  applicationId: unknown,
  inlineText: unknown,
) {
  try {
    const result = await attachRecruiterTextualEvidenceForAdmin(
      jobId,
      applicationId,
      inlineText,
    );
    revalidatePath("/dashboard/requirements");
    revalidatePath(`/dashboard/requirements/${jobId}`);
    return { ok: true as const, result };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    if (isEvidenceCaptureActionError(error)) {
      return {
        ok: false as const,
        error: evidenceCaptureActionErrorMessage(error),
      };
    }
    throw error;
  }
}
