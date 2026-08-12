import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  companyId: true,
  interviewerId: true,
  company: {
    select: {
      id: true,
      name: true,
      industry: true,
    },
  },
  interviewer: {
    select: {
      id: true,
      name: true,
      category: true,
      availability: true,
    },
  },
} satisfies Prisma.UserSelect;

export async function getUsers() {
  return prisma.user.findMany({
    select: userSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getUserById(id: number) {
  return prisma.user.findUnique({
    where: {
      id,
    },
    select: userSelect,
  });
}
