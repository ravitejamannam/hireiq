import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
  prismaClientGeneration?: string;
};

function prismaClientGeneration() {
  const candidate = Object.keys(Prisma.CandidateProfileScalarFieldEnum).sort().join(",");
  const interviewer = Object.keys(Prisma.InterviewerProfileScalarFieldEnum).sort().join(",");
  const company = Object.keys(Prisma.CompanyScalarFieldEnum).sort().join(",");
  return `${candidate}|${interviewer}|${company}`;
}

function createPrismaClient() {
  return new PrismaClient();
}

const generation = prismaClientGeneration();
const cached =
  globalForPrisma.prisma &&
  globalForPrisma.prismaClientGeneration === generation
    ? globalForPrisma.prisma
    : null;

if (globalForPrisma.prisma && cached === null) {
  void globalForPrisma.prisma.$disconnect();
}

export const prisma = cached ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaClientGeneration = generation;
}