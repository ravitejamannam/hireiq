"use server";

import { requireAdmin } from "@/lib/auth/authorization";
import {
  CandidateDeletionNotFound,
  CandidateDeletionRefused,
  deleteUnattachedCandidate,
} from "@/lib/candidates/candidate-deletion";
import { updateCandidateRecord } from "@/lib/candidates/candidate-record";
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
) {
  await requireAdmin();
  const candidate = await updateCandidateRecord(
    id,
    name,
    role,
    experienceYears,
    status,
  );

  revalidatePath("/dashboard/candidates");

  return candidate;
}

export async function deleteCandidate(id: number) {
  await requireAdmin();
  try {
    await deleteUnattachedCandidate(id);
  } catch (error) {
    if (
      error instanceof CandidateDeletionRefused ||
      error instanceof CandidateDeletionNotFound
    ) {
      return { ok: false as const, error: error.message };
    }
    throw error;
  }

  revalidatePath("/dashboard/candidates");
  return { ok: true as const };
}