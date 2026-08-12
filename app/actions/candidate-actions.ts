"use server";

import { requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { CandidateStatus } from "@prisma/client";

export async function createCandidate(
  name: string,
  role: string,
  experienceYears: number,
  status: CandidateStatus,
  companyId: number,
) {
  await requireAdmin();
  const candidate = await prisma.candidate.create({
    data: {
      name,
      role,
      experienceYears,
      status,
      companyId,
    },
  });

  revalidatePath("/dashboard/candidates");

  return candidate;
}

export async function updateCandidate(
  id: number,
  name: string,
  role: string,
  experienceYears: number,
  status: CandidateStatus,
  companyId: number,
) {
  await requireAdmin();
  const candidate = await prisma.candidate.update({
    where: {
      id,
    },
    data: {
      name,
      role,
      experienceYears,
      status,
      companyId,
    },
  });

  revalidatePath("/dashboard/candidates");

  return candidate;
}

export async function deleteCandidate(id: number) {
  await requireAdmin();
  await prisma.candidate.delete({
    where: {
      id,
    },
  });

  revalidatePath("/dashboard/candidates");
}