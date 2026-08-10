import { prisma } from "@/lib/prisma";

export async function getDashboardStats() {
  const [companies, candidates, interviews, codingTests] = await Promise.all([
    prisma.company.count(),
    prisma.candidate.count(),
    prisma.interview.count(),
    prisma.codingTest.count(),
  ]);

  return {
    companies,
    candidates,
    interviews,
    codingTests,
  };
}
