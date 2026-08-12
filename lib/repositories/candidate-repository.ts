import { prisma } from "@/lib/prisma";

import {
  candidateScopeWhere,
  requireUser,
} from "@/lib/auth/authorization";

export async function getCandidates() {
  const user = await requireUser();

  return prisma.candidate.findMany({
    where: candidateScopeWhere(user),
    include: {
      company: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getCandidateById(id: number) {
  const user = await requireUser();

  return prisma.candidate.findFirst({
    where: {
      id,
      ...candidateScopeWhere(user),
    },
    include: {
      company: true,
    },
  });
}
