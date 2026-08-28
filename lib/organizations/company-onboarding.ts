import {
  OrganizationMemberRole,
  OrganizationMemberStatus,
  PortalRole,

} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getPrismaErrorCode } from "@/lib/prisma-error";
import { allocateCompanyPublicSlug } from "@/lib/companies/public-slug";

export class CompanyOnboardingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompanyOnboardingError";
  }
}

function validateCompanyName(name: unknown) {
  if (typeof name !== "string" || !name.trim()) {
    throw new CompanyOnboardingError("Company name is required.");
  }

  return name.trim();
}

function validateIndustry(industry: unknown) {
  if (typeof industry !== "string" || !industry.trim()) {
    throw new CompanyOnboardingError("Industry is required.");
  }

  return industry.trim();
}

function validateEmployees(employees: unknown) {
  const value =
    typeof employees === "string" && employees.trim()
      ? Number(employees)
      : employees;

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new CompanyOnboardingError(
      "Employee count must be a positive integer.",
    );
  }

  return value;
}

export async function createClientCompanyForUser(input: {
  userId: number;
  name: unknown;
  industry: unknown;
  employees: unknown;
}) {
  const name = validateCompanyName(input.name);
  const industry = validateIndustry(input.industry);
  const employees = validateEmployees(input.employees);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>`
        SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE
      `;

      if (locked.length === 0) {
        throw new CompanyOnboardingError("Unauthorized.");
      }

      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          role: true,
          emailVerifiedAt: true,
          companyId: true,
        },
      });

      if (!user || user.role !== PortalRole.CLIENT || !user.emailVerifiedAt) {
        throw new CompanyOnboardingError("Unauthorized.");
      }

      if (user.companyId !== null) {
        throw new CompanyOnboardingError(
          "This account already belongs to a company.",
        );
      }

      const activeMembership = await tx.organizationMember.findFirst({
        where: {
          userId: user.id,
          status: OrganizationMemberStatus.ACTIVE,
        },
        select: { id: true },
      });

      if (activeMembership) {
        throw new CompanyOnboardingError(
          "This account already belongs to a company.",
        );
      }

      const publicSlug = await allocateCompanyPublicSlug(name, tx);
      const company = await tx.company.create({
        data: {
          name,
          industry,
          employees,
          publicSlug,
        },
        select: { id: true, name: true },
      });

      await tx.organizationMember.create({
        data: {
          companyId: company.id,
          userId: user.id,
          role: OrganizationMemberRole.OWNER,
          status: OrganizationMemberStatus.ACTIVE,
          invitedByUserId: null,
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { companyId: company.id },
      });

      return {
        companyId: company.id,
        companyName: company.name,
        ownerUserId: user.id,
      };
    });

    console.info("[onboarding] company_created", {
      companyId: result.companyId,
      ownerUserId: result.ownerUserId,
    });

    return result;
  } catch (error) {
    if (
      getPrismaErrorCode(error) === "P2002"
    ) {
      throw new CompanyOnboardingError(
        "This account already belongs to a company.",
      );
    }
    throw error;
  }
}
