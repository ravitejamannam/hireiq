import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

import {
  companyScopeWhere,
  requireUser,
} from "@/lib/auth/authorization";

const companyInclude = {
  candidates: true,
} satisfies Prisma.CompanyInclude;

export async function getCompanies() {
  const user = await requireUser();
  const scope = companyScopeWhere(user);

  if (scope === null) {
    return [];
  }

  return prisma.company.findMany({
    where: scope,
    include: companyInclude,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getCompanyById(id: number) {
  const user = await requireUser();
  const scope = companyScopeWhere(user);

  if (scope === null) {
    return null;
  }

  return prisma.company.findFirst({
    where: {
      id,
      ...scope,
    },
    include: companyInclude,
  });
}
