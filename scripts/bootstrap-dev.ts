/**
 * Idempotent local fixtures for HireIQ development.
 *
 * Creates 6 client companies (owner + member accounts), 5 interviewer
 * profiles with login accounts, 4 posted requirements per company, and
 * 20-40 pipeline candidates per company for local testing.
 *
 * Usage:
 *   BOOTSTRAP_PASSWORD=... pnpm db:bootstrap-dev
 *
 * Falls back to ADMIN_PASSWORD when BOOTSTRAP_PASSWORD is unset.
 * Never prints the password.
 */

import "dotenv/config";

import {
  InterviewerAvailability,
  InterviewerCategory,
  OrganizationMemberRole,
  OrganizationMemberStatus,
  PortalRole,
} from "@prisma/client";

import { hashPassword } from "../lib/auth/password";
import { prisma } from "../lib/prisma";
import { seedCompanyPipeline } from "./bootstrap-dev-pipeline";
import {
  UserValidationError,
  validateBootstrapPassword,
} from "../lib/validation/user-validation";

const COMPANIES = [
  {
    slug: "acme",
    name: "Acme Robotics",
    industry: "Engineering",
    employees: 180,
  },
  {
    slug: "globex",
    name: "Globex Finance",
    industry: "Finance",
    employees: 90,
  },
  {
    slug: "initech",
    name: "Initech Design",
    industry: "Design",
    employees: 45,
  },
  {
    slug: "umbrella",
    name: "Umbrella Health",
    industry: "Healthcare",
    employees: 240,
  },
  {
    slug: "stark",
    name: "Stark Manufacturing",
    industry: "Manufacturing",
    employees: 620,
  },
  {
    slug: "wayne",
    name: "Wayne Media",
    industry: "Media",
    employees: 75,
  },
] as const;

const INTERVIEWERS = [
  {
    slug: "priya",
    name: "Priya Sharma",
    category: InterviewerCategory.ENGINEERING,
  },
  {
    slug: "arjun",
    name: "Arjun Mehta",
    category: InterviewerCategory.DATA_SCIENCE,
  },
  {
    slug: "kavya",
    name: "Kavya Iyer",
    category: InterviewerCategory.PRODUCT,
  },
  {
    slug: "rohan",
    name: "Rohan Desai",
    category: InterviewerCategory.DESIGN,
  },
  {
    slug: "neha",
    name: "Neha Kapoor",
    category: InterviewerCategory.ENGINEERING,
  },
] as const;

function ownerEmail(slug: string) {
  return `owner.${slug}@hireiq.local`;
}

function memberEmail(slug: string) {
  return `member.${slug}@hireiq.local`;
}

function interviewerEmail(slug: string) {
  return `interviewer.${slug}@hireiq.local`;
}

async function ensureClientUser(input: {
  email: string;
  name: string;
  passwordHash: string;
  companyId: number;
  membershipRole: OrganizationMemberRole;
  invitedByUserId: number | null;
  now: Date;
}) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      role: true,
      companyId: true,
    },
  });

  if (existing) {
    if (existing.role !== PortalRole.CLIENT) {
      throw new Error(
        `Fixture email ${input.email} already exists as ${existing.role}.`,
      );
    }

    const membership = await prisma.organizationMember.findUnique({
      where: {
        companyId_userId: {
          companyId: input.companyId,
          userId: existing.id,
        },
      },
      select: { id: true, role: true, status: true },
    });

    if (!membership) {
      await prisma.organizationMember.create({
        data: {
          companyId: input.companyId,
          userId: existing.id,
          role: input.membershipRole,
          status: OrganizationMemberStatus.ACTIVE,
          invitedByUserId: input.invitedByUserId,
        },
      });
    }

    if (existing.companyId !== input.companyId) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          companyId: input.companyId,
          emailVerifiedAt: input.now,
        },
      });
    }

    return { id: existing.id, created: false };
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: PortalRole.CLIENT,
      passwordHash: input.passwordHash,
      companyId: input.companyId,
      interviewerId: null,
      emailVerifiedAt: input.now,
    },
    select: { id: true },
  });

  await prisma.organizationMember.create({
    data: {
      companyId: input.companyId,
      userId: user.id,
      role: input.membershipRole,
      status: OrganizationMemberStatus.ACTIVE,
      invitedByUserId: input.invitedByUserId,
    },
  });

  return { id: user.id, created: true };
}

async function ensureInterviewer(input: {
  email: string;
  name: string;
  category: InterviewerCategory;
  passwordHash: string;
  now: Date;
}) {
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      role: true,
      interviewerId: true,
    },
  });

  if (existingUser) {
    if (existingUser.role !== PortalRole.INTERVIEWER) {
      throw new Error(
        `Fixture email ${input.email} already exists as ${existingUser.role}.`,
      );
    }

    if (!existingUser.interviewerId) {
      throw new Error(
        `Fixture email ${input.email} is an interviewer without a profile.`,
      );
    }

    return { created: false, interviewerId: existingUser.interviewerId };
  }

  const interviewer = await prisma.interviewer.create({
    data: {
      name: input.name,
      category: input.category,
      availability: InterviewerAvailability.AVAILABLE,
    },
    select: { id: true },
  });

  await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: PortalRole.INTERVIEWER,
      passwordHash: input.passwordHash,
      companyId: null,
      interviewerId: interviewer.id,
      emailVerifiedAt: input.now,
    },
  });

  return { created: true, interviewerId: interviewer.id };
}

async function bootstrapDev() {
  const passwordRaw =
    process.env.BOOTSTRAP_PASSWORD ?? process.env.ADMIN_PASSWORD;

  if (!passwordRaw) {
    console.error(
      "Missing required environment variable: BOOTSTRAP_PASSWORD (or ADMIN_PASSWORD).",
    );
    process.exit(1);
  }

  try {
    validateBootstrapPassword(passwordRaw);
  } catch (error) {
    if (error instanceof UserValidationError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  const passwordHash = await hashPassword(passwordRaw);
  const now = new Date();
  const created: string[] = [];
  const skipped: string[] = [];
  const interviewerIds: Record<string, number> = {};
  const seededCompanies: Array<{
    id: number;
    name: string;
    slug: string;
    ownerUserId: number;
  }> = [];

  for (const company of COMPANIES) {
    const existingCompany = await prisma.company.findFirst({
      where: { name: company.name },
      select: { id: true, name: true },
    });

    const row =
      existingCompany ??
      (await prisma.company.create({
        data: {
          name: company.name,
          industry: company.industry,
          employees: company.employees,
        },
        select: { id: true, name: true },
      }));

    if (existingCompany) {
      skipped.push(`company ${company.name}`);
    } else {
      created.push(`company ${company.name}`);
    }

    const owner = await ensureClientUser({
      email: ownerEmail(company.slug),
      name: `${company.name} Owner`,
      passwordHash,
      companyId: row.id,
      membershipRole: OrganizationMemberRole.OWNER,
      invitedByUserId: null,
      now,
    });

    if (owner.created) {
      created.push(`owner ${ownerEmail(company.slug)}`);
    } else {
      skipped.push(`owner ${ownerEmail(company.slug)}`);
    }

    const member = await ensureClientUser({
      email: memberEmail(company.slug),
      name: `${company.name} Member`,
      passwordHash,
      companyId: row.id,
      membershipRole: OrganizationMemberRole.MEMBER,
      invitedByUserId: owner.id,
      now,
    });

    if (member.created) {
      created.push(`member ${memberEmail(company.slug)}`);
    } else {
      skipped.push(`member ${memberEmail(company.slug)}`);
    }

    seededCompanies.push({
      id: row.id,
      name: company.name,
      slug: company.slug,
      ownerUserId: owner.id,
    });
  }

  for (const interviewer of INTERVIEWERS) {
    const result = await ensureInterviewer({
      email: interviewerEmail(interviewer.slug),
      name: interviewer.name,
      category: interviewer.category,
      passwordHash,
      now,
    });

    if (result.created) {
      created.push(`interviewer ${interviewerEmail(interviewer.slug)}`);
    } else {
      skipped.push(`interviewer ${interviewerEmail(interviewer.slug)}`);
    }

    interviewerIds[interviewer.slug] = result.interviewerId;
  }

  for (const company of seededCompanies) {
    const pipeline = await seedCompanyPipeline({
      companyId: company.id,
      companyName: company.name,
      companySlug: company.slug,
      ownerUserId: company.ownerUserId,
      interviewers: interviewerIds,
    });

    if (pipeline.jobsCreated > 0 || pipeline.candidatesCreated > 0) {
      created.push(
        `${pipeline.jobsCreated} jobs and ${pipeline.candidatesCreated} candidates for ${company.name}`,
      );
    } else {
      skipped.push(`pipeline for ${company.name}`);
    }
  }

  console.log("Dev bootstrap complete.");
  console.log(`Created: ${created.length}`);
  console.log(`Skipped (already present): ${skipped.length}`);
  console.log("");
  console.log("Client owners:");
  for (const company of COMPANIES) {
    console.log(`  ${ownerEmail(company.slug)}  OWNER  ${company.name}`);
  }
  console.log("Client members:");
  for (const company of COMPANIES) {
    console.log(`  ${memberEmail(company.slug)}  MEMBER  ${company.name}`);
  }
  console.log("Interviewers:");
  for (const interviewer of INTERVIEWERS) {
    console.log(
      `  ${interviewerEmail(interviewer.slug)}  INTERVIEWER  ${interviewer.name} (${interviewer.category})`,
    );
  }
  console.log("");
  console.log(
    "Password is BOOTSTRAP_PASSWORD, or ADMIN_PASSWORD if that was unset.",
  );
}

bootstrapDev()
  .catch((error) => {
    console.error("Dev bootstrap failed.");
    if (error instanceof Error && !error.message.toLowerCase().includes("password")) {
      console.error(error.message);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
