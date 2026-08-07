"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createCompany(
  name: string,
  industry: string,
  employees: number,
) {
  const company = await prisma.company.create({
    data: {
      name,

      industry,

      employees,
    },
  });

  revalidatePath("/dashboard/companies");

  return company;
}

export async function deleteCompany(id: number) {
  await prisma.company.delete({
    where: {
      id,
    },
  });

  revalidatePath("/dashboard/companies");
}

export async function updateCompany(
  id: number,
  name: string,
  industry: string,
  employees: number,
) {
  const company = await prisma.company.update({
    where: {
      id,
    },

    data: {
      name,
      industry,
      employees,
    },
  });

  revalidatePath("/dashboard/companies");

  return company;
}
