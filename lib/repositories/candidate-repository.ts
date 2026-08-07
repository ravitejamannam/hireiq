import { prisma } from "@/lib/prisma";

export async function getCandidates() {
  return prisma.candidate.findMany({
    include: {
      company: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getCandidateById(id: number) {
  return prisma.candidate.findUnique({
    where: {
      id,
    },
    include: {
      company: true,
    },
  });
}