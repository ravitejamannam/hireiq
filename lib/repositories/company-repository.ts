import { prisma } from "@/lib/prisma";

export async function getCompanies() {
  return prisma.company.findMany({
    include: {
      candidates: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getCompanyById(id: number) {
  return prisma.company.findUnique({
    where: {
      id,
    },
    include: {
      candidates: true,
    },
  });
}