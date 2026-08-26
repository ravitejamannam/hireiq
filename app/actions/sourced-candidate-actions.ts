"use server";

import { revalidatePath } from "next/cache";

import { addSourcedCandidate } from "@/lib/candidates/sourced-intake";

export async function addSourcedCandidateAction(input: {
  jobId: number;
  name: string;
  email?: string;
  skills?: string;
  experienceYears?: number;
  location?: string;
  currentEmployer?: string;
  expectedCTC?: string;
  source: "LINKEDIN" | "NAUKRI";
}) {
  const result = await addSourcedCandidate(input);
  if (result.ok) {
    revalidatePath(`/dashboard/requirements/${input.jobId}`);
    revalidatePath("/dashboard/pipeline");
  }
  return result;
}
