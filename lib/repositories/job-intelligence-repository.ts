import {
  JobIntelligenceExtractorType,
  JobIntelligenceRunStatus,
  JobSpecificationVersionStatus,
  Prisma,
} from "@prisma/client";

import type { RequirementDraft } from "@/lib/jobs/intelligence/job-intelligence-types";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

const requirementSelect = {
  id: true,
  companyId: true,
  runId: true,
  jobId: true,
  jobSpecificationVersionId: true,
  stableKey: true,
  sourceField: true,
  sourceText: true,
  sourceSpanStart: true,
  sourceSpanEnd: true,
  category: true,
  normalizedValue: true,
  skillConceptId: true,
  provenance: true,
  uncertainty: true,
  createdAt: true,
} satisfies Prisma.JobRequirementSelect;

const runSelect = {
  id: true,
  companyId: true,
  jobId: true,
  jobSpecificationVersionId: true,
  status: true,
  extractorType: true,
  extractorVersion: true,
  inputHash: true,
  createdAt: true,
  completedAt: true,
  errorCode: true,
  requirements: {
    select: requirementSelect,
    orderBy: { id: "asc" },
  },
} satisfies Prisma.JobIntelligenceRunSelect;

export type JobIntelligenceRunRow = Prisma.JobIntelligenceRunGetPayload<{
  select: typeof runSelect;
}>;

export type JobIntelligenceIdempotencyKey = {
  companyId: number;
  jobId: number;
  jobSpecificationVersionId: number;
  extractorType: JobIntelligenceExtractorType;
  extractorVersion: string;
  inputHash: string;
};

export async function getPublishedSpecForJobIntelligence(
  specificationId: number,
  db: Db = prisma,
) {
  return db.jobSpecificationVersion.findFirst({
    where: { id: specificationId },
    select: {
      id: true,
      jobId: true,
      versionNumber: true,
      status: true,
      title: true,
      primarySkills: true,
      mustHaveRequirements: true,
      niceToHaveRequirements: true,
      location: true,
      experienceRange: true,
      jobDescription: true,
      evaluationCriteria: true,
      structuredPayload: true,
      job: { select: { id: true, companyId: true } },
    },
  });
}

export async function listPublishedSpecsForJob(
  jobId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.jobSpecificationVersion.findMany({
    where: {
      jobId,
      status: JobSpecificationVersionStatus.PUBLISHED,
      job: { companyId },
    },
    select: { id: true, versionNumber: true, title: true },
    orderBy: { versionNumber: "desc" },
  });
}

export async function findCompletedJobIntelligenceRun(
  key: JobIntelligenceIdempotencyKey,
  db: Db = prisma,
) {
  return db.jobIntelligenceRun.findFirst({
    where: {
      companyId: key.companyId,
      jobId: key.jobId,
      jobSpecificationVersionId: key.jobSpecificationVersionId,
      extractorType: key.extractorType,
      extractorVersion: key.extractorVersion,
      inputHash: key.inputHash,
      status: JobIntelligenceRunStatus.COMPLETED,
    },
    select: runSelect,
    orderBy: { id: "desc" },
  });
}

export async function findLatestRunningJobIntelligenceRun(
  key: JobIntelligenceIdempotencyKey,
  db: Db = prisma,
) {
  return db.jobIntelligenceRun.findFirst({
    where: {
      companyId: key.companyId,
      jobId: key.jobId,
      jobSpecificationVersionId: key.jobSpecificationVersionId,
      extractorType: key.extractorType,
      extractorVersion: key.extractorVersion,
      inputHash: key.inputHash,
      status: JobIntelligenceRunStatus.RUNNING,
    },
    select: { id: true, companyId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createJobIntelligenceRun(
  key: JobIntelligenceIdempotencyKey,
  db: Db = prisma,
) {
  return db.jobIntelligenceRun.create({
    data: {
      companyId: key.companyId,
      jobId: key.jobId,
      jobSpecificationVersionId: key.jobSpecificationVersionId,
      status: JobIntelligenceRunStatus.RUNNING,
      extractorType: key.extractorType,
      extractorVersion: key.extractorVersion,
      inputHash: key.inputHash,
    },
    select: { id: true, companyId: true, createdAt: true },
  });
}

export async function createJobRequirements(
  input: {
    companyId: number;
    runId: number;
    jobId: number;
    jobSpecificationVersionId: number;
    rows: Array<RequirementDraft & { skillConceptId: number | null }>;
  },
  db: Db = prisma,
) {
  if (input.rows.length === 0) {
    return;
  }
  await db.jobRequirement.createMany({
    data: input.rows.map((row) => ({
      companyId: input.companyId,
      runId: input.runId,
      jobId: input.jobId,
      jobSpecificationVersionId: input.jobSpecificationVersionId,
      stableKey: row.stableKey,
      sourceField: row.sourceField,
      sourceText: row.sourceText,
      sourceSpanStart: row.sourceSpanStart,
      sourceSpanEnd: row.sourceSpanEnd,
      category: row.category,
      normalizedValue: row.normalizedValue,
      skillConceptId: row.skillConceptId,
      provenance: row.provenance,
      uncertainty: row.uncertainty,
    })),
  });
}

export async function markJobIntelligenceRunCompleted(
  runId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.jobIntelligenceRun.updateMany({
    where: {
      id: runId,
      companyId,
      status: JobIntelligenceRunStatus.RUNNING,
    },
    data: {
      status: JobIntelligenceRunStatus.COMPLETED,
      completedAt: new Date(),
      errorCode: null,
    },
  });
}

export async function markJobIntelligenceRunFailed(
  runId: number,
  companyId: number,
  errorCode: string,
  db: Db = prisma,
) {
  return db.jobIntelligenceRun.updateMany({
    where: {
      id: runId,
      companyId,
      status: JobIntelligenceRunStatus.RUNNING,
    },
    data: {
      status: JobIntelligenceRunStatus.FAILED,
      completedAt: new Date(),
      errorCode,
    },
  });
}

export async function getJobIntelligenceRunWithRows(
  runId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.jobIntelligenceRun.findFirst({
    where: { id: runId, companyId },
    select: runSelect,
  });
}

export async function listJobIntelligenceRunsForJob(
  jobId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.jobIntelligenceRun.findMany({
    where: { jobId, companyId },
    select: runSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function findSkillConceptId(
  ontologyVersion: string,
  canonicalKey: string,
  db: Db = prisma,
) {
  const row = await db.skillConcept.findFirst({
    where: { ontologyVersion, canonicalKey, active: true },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function findLatestCompletedJobIntelligenceForSpec(
  jobSpecificationVersionId: number,
  companyId: number,
  db: Db = prisma,
) {
  return db.jobIntelligenceRun.findFirst({
    where: {
      jobSpecificationVersionId,
      companyId,
      status: JobIntelligenceRunStatus.COMPLETED,
    },
    select: runSelect,
    orderBy: { id: "desc" },
  });
}
