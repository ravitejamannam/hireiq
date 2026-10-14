import type { CandidateStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function updateCandidateRecord(
  id: number,
  name: string,
  role: string,
  experienceYears: number,
  status: CandidateStatus,
) {
  return prisma.candidate.update({
    where: { id },
    data: {
      name,
      role,
      experienceYears,
      status,
    },
  });
}
