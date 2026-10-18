"use server";

import { revalidatePath } from "next/cache";
import { RequirementApprovalStatus, RequirementEvidenceType } from "@prisma/client";

import { requireClientPortal } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

const EVIDENCE = new Set<string>(["RESUME", "ASSESSMENT", "INTERVIEW"]);

export async function approveJobRequirement(input: {
  jobId: number;
  requirementId: number;
  evidenceType: string;
}) {
  const client = await requireClientPortal();
  if (!EVIDENCE.has(input.evidenceType)) {
    throw new Error("Choose an evidence type before approving.");
  }
  const row = await prisma.jobRequirement.findFirst({
    where: {
      id: input.requirementId,
      jobId: input.jobId,
      companyId: client.companyId,
    },
    select: { id: true },
  });
  if (!row) throw new Error("Requirement was not found.");
  await prisma.jobRequirement.update({
    where: { id: row.id },
    data: {
      approvalStatus: RequirementApprovalStatus.APPROVED,
      evidenceType: input.evidenceType as RequirementEvidenceType,
      approvedByUserId: client.id,
      origin: "HUMAN",
    },
  });
  revalidatePath(`/client/requirements/${input.jobId}`);
}
