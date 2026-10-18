"use server";

import { revalidatePath } from "next/cache";

import { createDraftAssessment, publishAssessment, regenerateAssessmentItem } from "@/lib/assessments/generated-assessment-service";
import { requireAdmin } from "@/lib/auth/authorization";

export async function createJobAssessmentDraft(jobId: number) {
  await requireAdmin();
  const draft = await createDraftAssessment(jobId);
  revalidatePath(`/dashboard/jobs/${jobId}/assessment`);
  return draft.id;
}

export async function regenerateJobAssessmentItem(assessmentId: number, itemId: string) {
  await requireAdmin();
  await regenerateAssessmentItem(assessmentId, itemId);
}

export async function publishJobAssessment(assessmentId: number) {
  const admin = await requireAdmin();
  const published = await publishAssessment(assessmentId, admin.id);
  revalidatePath(`/dashboard/jobs/${published.jobId}/assessment`);
}
