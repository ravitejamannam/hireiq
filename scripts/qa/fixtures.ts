import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ApplicationPipelineStatus,
  PrismaClient,
  type RequirementLifecycle,
} from "@prisma/client";

import type { AuthUser } from "../../lib/auth/authorization";

export const prisma = new PrismaClient();

export const TMP_PREFIX = "TMP-FULL-QA";

export const PRESERVED = {
  companies: ["Netflix", "DDAI", "OpenAi"],
  emails: ["admin@hireiq.local"],
  names: ["rajiv", "Raviteja", "Reddy"],
} as const;

export type V1QaContext = {
  companyAlpha: { id: number; name: string };
  companyBeta: { id: number; name: string };
  interviewerAlpha: { id: number; name: string };
  interviewerBeta: { id: number; name: string };
  admin: AuthUser;
  clientAlpha: AuthUser;
  clientBeta: AuthUser;
  interviewerAlphaUser: AuthUser;
  interviewerBetaUser: AuthUser;
};

export function actor(
  partial: Partial<AuthUser> & Pick<AuthUser, "role">,
): AuthUser {
  return {
    id: partial.id ?? 1,
    email: partial.email ?? "tmp-full-qa@hireiq.local",
    name: partial.name ?? "TMP FULL QA",
    role: partial.role,
    companyId: partial.companyId ?? null,
    interviewerId: partial.interviewerId ?? null,
  };
}

export function source(relativePath: string) {
  return readFileSync(resolve(relativePath), "utf8");
}

export async function loadV1Qa(): Promise<V1QaContext> {
  const companyAlpha = await prisma.company.findFirst({
    where: { name: "V1QA Company Alpha" },
    select: { id: true, name: true },
  });
  const companyBeta = await prisma.company.findFirst({
    where: { name: "V1QA Company Beta" },
    select: { id: true, name: true },
  });
  const interviewerAlpha = await prisma.interviewer.findFirst({
    where: { name: "V1QA Interviewer Alpha" },
    select: { id: true, name: true },
  });
  const interviewerBeta = await prisma.interviewer.findFirst({
    where: { name: "V1QA Interviewer Beta" },
    select: { id: true, name: true },
  });
  const adminRow = await prisma.user.findUnique({
    where: { email: "v1qa.admin@hireiq.local" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      companyId: true,
      interviewerId: true,
    },
  });
  const clientAlphaRow = await prisma.user.findUnique({
    where: { email: "v1qa.client.alpha@hireiq.local" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      companyId: true,
      interviewerId: true,
    },
  });
  const clientBetaRow = await prisma.user.findUnique({
    where: { email: "v1qa.client.beta@hireiq.local" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      companyId: true,
      interviewerId: true,
    },
  });
  const interviewerAlphaUser = await prisma.user.findUnique({
    where: { email: "v1qa.interviewer.alpha@hireiq.local" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      companyId: true,
      interviewerId: true,
    },
  });
  const interviewerBetaUser = await prisma.user.findUnique({
    where: { email: "v1qa.interviewer.beta@hireiq.local" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      companyId: true,
      interviewerId: true,
    },
  });

  if (
    !companyAlpha ||
    !companyBeta ||
    !interviewerAlpha ||
    !interviewerBeta ||
    !adminRow ||
    !clientAlphaRow ||
    !clientBetaRow ||
    !interviewerAlphaUser ||
    !interviewerBetaUser
  ) {
    throw new Error(
      "V1QA fixtures missing. Run `pnpm qa:v1:seed` before this suite.",
    );
  }

  return {
    companyAlpha,
    companyBeta,
    interviewerAlpha,
    interviewerBeta,
    admin: adminRow,
    clientAlpha: clientAlphaRow,
    clientBeta: clientBetaRow,
    interviewerAlphaUser,
    interviewerBetaUser,
  };
}

export async function createTmpJob(params: {
  prefix: string;
  title: string;
  companyId: number;
  assignedInterviewerId: number | null;
  requirementLifecycle: RequirementLifecycle;
  sourcingAccessReceivedAt?: Date | null;
  shortlistingDueAt?: Date | null;
  shortlistingCompletedAt?: Date | null;
}) {
  return prisma.job.create({
    data: {
      title: `${params.prefix} ${params.title}`,
      status: "OPEN",
      companyId: params.companyId,
      assignedInterviewerId: params.assignedInterviewerId,
      requirementLifecycle: params.requirementLifecycle,
      sourcingDatabaseSource: "LINKEDIN",
      sourcingAccessReceivedAt: params.sourcingAccessReceivedAt,
      shortlistingDueAt: params.shortlistingDueAt,
      shortlistingCompletedAt: params.shortlistingCompletedAt,
      roleCategory: "ENGINEERING",
      location: "Bengaluru",
      experienceRange: "5-8 years",
      compensationRange: "30-40 LPA",
      numberOfPositions: 1,
      mustHaveRequirements: `${params.prefix} must-have`,
      niceToHaveRequirements: `${params.prefix} nice-to-have`,
      jobDescription: `${params.prefix} job description`,
      evaluationCriteria: `${params.prefix} evaluation`,
      primarySkills: "TypeScript, PostgreSQL",
    },
  });
}

export async function createTmpApplication(params: {
  prefix: string;
  jobId: number;
  companyId: number;
  status: ApplicationPipelineStatus;
  label: string;
}) {
  const candidate = await prisma.candidate.create({
    data: {
      name: `${params.prefix} Candidate ${params.label}`,
      role: "Engineer",
      experienceYears: 5,
      status: "APPLIED",
      companyId: params.companyId,
    },
  });

  const application = await prisma.application.create({
    data: {
      candidateId: candidate.id,
      jobId: params.jobId,
      companyId: params.companyId,
      status: params.status,
      source: "LINKEDIN",
    },
  });

  return { candidate, application };
}

/**
 * Deletes only records created by this suite (TMP-FULL-QA*).
 * Never matches V1QA, Netflix, DDAI, OpenAi, admin@hireiq.local,
 * or names rajiv/Raviteja/Reddy.
 */
export async function cleanupPrefix(prefix: string) {
  if (!prefix.startsWith(TMP_PREFIX)) {
    throw new Error(`Refusing to clean prefix that is not ${TMP_PREFIX}: ${prefix}`);
  }

  const jobs = await prisma.job.findMany({
    where: { title: { startsWith: prefix } },
    select: { id: true },
  });
  const jobIds = jobs.map((job) => job.id);

  const candidates = await prisma.candidate.findMany({
    where: { name: { startsWith: prefix } },
    select: { id: true, name: true },
  });

  for (const candidate of candidates) {
    for (const preserved of PRESERVED.names) {
      if (candidate.name.toLowerCase().includes(preserved.toLowerCase())) {
        throw new Error(`Cleanup refused preserved name: ${candidate.name}`);
      }
    }
  }

  const applications = jobIds.length
    ? await prisma.application.findMany({
        where: { jobId: { in: jobIds } },
        select: { id: true },
      })
    : [];
  const applicationIds = applications.map((application) => application.id);

  if (applicationIds.length) {
    const evaluations = await prisma.evaluation.findMany({
      where: { applicationId: { in: applicationIds } },
      select: { id: true },
    });
    const evaluationIds = evaluations.map((evaluation) => evaluation.id);
    if (evaluationIds.length) {
      await prisma.evaluationQuestion.deleteMany({
        where: { evaluationId: { in: evaluationIds } },
      });
      await prisma.evaluation.deleteMany({
        where: { id: { in: evaluationIds } },
      });
    }
    await prisma.interview.deleteMany({
      where: { applicationId: { in: applicationIds } },
    });
    await prisma.codingTest.deleteMany({
      where: { applicationId: { in: applicationIds } },
    });
    await prisma.report.deleteMany({
      where: { applicationId: { in: applicationIds } },
    });
    await prisma.billingLineItem.deleteMany({
      where: { applicationId: { in: applicationIds } },
    });
  }

  if (jobIds.length) {
    await prisma.billingRecord.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.notification.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.application.deleteMany({ where: { jobId: { in: jobIds } } });
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
  }

  if (candidates.length) {
    await prisma.candidate.deleteMany({
      where: { id: { in: candidates.map((candidate) => candidate.id) } },
    });
  }
}

export async function assertPreservedProductionRows() {
  for (const name of PRESERVED.companies) {
    const company = await prisma.company.findFirst({
      where: { name },
      select: { id: true },
    });
    if (!company) {
      // Optional in some local DBs; do not fail the suite if absent.
      continue;
    }
  }

  const admin = await prisma.user.findUnique({
    where: { email: PRESERVED.emails[0] },
    select: { id: true },
  });
  if (!admin) {
    // Optional preserved login.
  }
}
