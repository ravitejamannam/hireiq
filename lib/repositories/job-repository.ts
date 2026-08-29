import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { JobSpecificationVersionStatus } from "@prisma/client";

import { jobScopeWhere, requireUser } from "@/lib/auth/authorization";
import {
  JOB_SPECIFICATION_SCALAR_SELECT,
  readEditableJobSpecification,
} from "@/lib/jobs/job-specification";

const jobSelect = {
  id: true,
  title: true,
  status: true,
  companyId: true,
  assignedInterviewerId: true,
  roleCategory: true,
  experienceRange: true,
  location: true,
  compensationRange: true,
  targetHireDate: true,
  numberOfPositions: true,
  mustHaveRequirements: true,
  niceToHaveRequirements: true,
  jobDescription: true,
  evaluationCriteria: true,
  primarySkills: true,
  requirementLifecycle: true,
  clientCompletedAt: true,
  sourcingDatabaseSource: true,
  sourcingAccessDetails: true,
  sourcingAccessReceivedAt: true,
  shortlistingDueAt: true,
  shortlistingCompletedAt: true,
  interviewRoundPlan: true,
  createdAt: true,
  updatedAt: true,
  currentPublishedSpecificationVersion: {
    select: {
      structuredPayload: true,
    },
  },
  company: {
    select: {
      id: true,
      name: true,
      publicSlug: true,
      industry: true,
      employees: true,
    },
  },
  assignedInterviewer: {
    select: {
      id: true,
      name: true,
      category: true,
      availability: true,
    },
  },
  _count: {
    select: {
      applications: true,
    },
  },
  applications: {
    select: {
      status: true,
    },
  },
} satisfies Prisma.JobSelect;

const jobSpecificationSelect = {
  currentPublishedSpecificationVersion: {
    select: {
      ...JOB_SPECIFICATION_SCALAR_SELECT,
      structuredPayload: true,
    },
  },
  specificationVersions: {
    where: {
      status: JobSpecificationVersionStatus.DRAFT,
    },
    take: 1,
    select: {
      ...JOB_SPECIFICATION_SCALAR_SELECT,
      updatedAt: true,
      aiProposedJobDescription: true,
      aiGenerationStatus: true,
      aiGeneratedAt: true,
    },
  },
} satisfies Prisma.JobSelect;

export async function getJobs() {
  const user = await requireUser();

  return prisma.job.findMany({
    where: jobScopeWhere(user),
    select: jobSelect,
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getJobById(id: number) {
  const user = await requireUser();

  const job = await prisma.job.findFirst({
    where: {
      id,
      ...jobScopeWhere(user),
    },
    select: {
      ...jobSelect,
      ...jobSpecificationSelect,
    },
  });

  if (!job) {
    return null;
  }

  const spec = readEditableJobSpecification(job);
  const draft = job.specificationVersions[0] ?? null;
  const specificationUpdatedAt = draft?.updatedAt ?? null;
  const {
    currentPublishedSpecificationVersion,
    specificationVersions,
    ...rest
  } = job;
  void specificationVersions;

  return {
    ...rest,
    ...spec,
    structuredPayload: currentPublishedSpecificationVersion?.structuredPayload ?? null,
    specificationUpdatedAt,
    hasDraftSpecification: draft !== null,
    hasPublishedSpecification: currentPublishedSpecificationVersion != null,
    aiProposedJobDescription: draft?.aiProposedJobDescription ?? null,
    aiGenerationStatus: draft?.aiGenerationStatus ?? null,
    aiGeneratedAt: draft?.aiGeneratedAt ?? null,
  };
}
