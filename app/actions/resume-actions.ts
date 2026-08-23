"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/authorization";
import {
  isResumeUploadActionError,
  listResumeDocumentsForCandidate,
  resumeUploadActionErrorMessage,
  uploadResumeForAdmin,
} from "@/lib/resumes/resume-service";

export async function getResumeDocuments(candidateId: unknown) {
  await requireAdmin();
  return listResumeDocumentsForCandidate(candidateId);
}

export async function uploadCandidateResume(
  candidateId: unknown,
  applicationId: unknown,
  formData: FormData,
) {
  try {
    const admin = await requireAdmin();

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false as const, error: "Choose a resume file to upload." };
    }
    const bytes = Buffer.from(await file.arrayBuffer());

    const result = await uploadResumeForAdmin({
      candidateId,
      applicationId,
      actorUserId: admin.id,
      file: { name: file.name, type: file.type, bytes },
    });

    revalidatePath(`/dashboard/candidates/${candidateId}`);
    return { ok: true as const, document: result };
  } catch (error) {
    if (isResumeUploadActionError(error)) {
      return { ok: false as const, error: resumeUploadActionErrorMessage(error) };
    }
    throw error;
  }
}
