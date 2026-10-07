import {
  JobRequirementCategory,
  PortalRole,
  RequirementAssessmentRunStatus,
} from "@prisma/client";

import { AuthorizationError, requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { M11_BASELINE_INCOMPATIBLE, M11_NOT_FOUND, M11RerankError } from "@/lib/rerank/m11-errors";
import { rerankM10Candidates } from "@/lib/rerank/m11-engine";
import { M11_RERANK_VERSION } from "@/lib/rerank/m11-versions";
import { HYBRID_FUSION_VERSION } from "@/lib/retrieval/hybrid-retrieval-versions";
import { isAdminM11Role, validateM11PositiveId } from "@/lib/validation/m11-validation";

async function requireM11Admin() {
  const admin = await requireAdmin();
  if (!isAdminM11Role(admin.role ?? PortalRole.CLIENT)) {
    throw new AuthorizationError("Resource not found.");
  }
}

export async function listM11HybridRuns(jobIdInput: unknown) {
  await requireM11Admin();
  const jobId = validateM11PositiveId(jobIdInput, "Job");
  const job = await prisma.job.findFirst({
    where: { id: jobId },
    select: { id: true, companyId: true },
  });
  if (!job) {
    throw new M11RerankError("Job was not found.", M11_NOT_FOUND);
  }
  const runs = await prisma.hybridRetrievalRun.findMany({
    where: {
      jobId: job.id,
      companyId: job.companyId,
      status: "COMPLETED",
      fusionVersion: HYBRID_FUSION_VERSION,
    },
    select: { id: true, resultLimit: true, retrievedCount: true },
    orderBy: { id: "desc" },
  });
  return { jobId: job.id, runs };
}

export async function executeM11Rerank(input: { jobId: number; hybridRunId: number }) {
  const job = await prisma.job.findFirst({
    where: { id: input.jobId },
    select: { id: true, companyId: true },
  });
  if (!job) {
    throw new M11RerankError("Job was not found.", M11_NOT_FOUND);
  }

  const hybrid = await prisma.hybridRetrievalRun.findFirst({
    where: { id: input.hybridRunId, companyId: job.companyId },
    select: {
      id: true,
      companyId: true,
      jobId: true,
      jobSpecificationVersionId: true,
      status: true,
      fusionVersion: true,
      rrfK: true,
      results: {
        select: {
          applicationId: true,
          candidateId: true,
          companyId: true,
          rank: true,
          rrfScore: true,
        },
        orderBy: { rank: "asc" },
      },
    },
  });
  if (!hybrid || hybrid.jobId !== job.id || hybrid.status !== "COMPLETED") {
    throw new M11RerankError("Completed M10 run was not found for this job.", M11_NOT_FOUND);
  }
  if (hybrid.fusionVersion !== HYBRID_FUSION_VERSION) {
    throw new M11RerankError("M10 run is not the registered fusion version.", M11_BASELINE_INCOMPATIBLE);
  }

  const requirements = await prisma.jobRequirement.findMany({
    where: {
      companyId: job.companyId,
      jobId: job.id,
      jobSpecificationVersionId: hybrid.jobSpecificationVersionId,
      category: JobRequirementCategory.REQUIRED,
    },
    select: {
      id: true,
      companyId: true,
      category: true,
      sourceField: true,
      skillConceptId: true,
    },
  });

  const applicationIds = hybrid.results.map((row) => row.applicationId);
  const assessmentRuns = await prisma.requirementAssessmentRun.findMany({
    where: {
      companyId: job.companyId,
      jobId: job.id,
      jobSpecificationVersionId: hybrid.jobSpecificationVersionId,
      applicationId: { in: applicationIds },
      status: RequirementAssessmentRunStatus.COMPLETED,
    },
    select: { id: true, applicationId: true },
    orderBy: { id: "desc" },
  });
  const latestRunByApplication = new Map<number, number>();
  for (const run of assessmentRuns) {
    if (!latestRunByApplication.has(run.applicationId)) {
      latestRunByApplication.set(run.applicationId, run.id);
    }
  }
  const assessments = latestRunByApplication.size
    ? await prisma.requirementAssessment.findMany({
        where: {
          companyId: job.companyId,
          runId: { in: [...latestRunByApplication.values()] },
          applicationId: { in: applicationIds },
        },
        select: {
          id: true,
          companyId: true,
          applicationId: true,
          jobRequirementId: true,
          supportState: true,
          claimId: true,
          evidenceId: true,
        },
      })
    : [];

  const ordered = rerankM10Candidates({
    companyId: job.companyId,
    candidates: hybrid.results.map((row) => ({
      applicationId: row.applicationId,
      candidateId: row.candidateId,
      companyId: row.companyId,
      m10Rank: row.rank,
      rrfScore: row.rrfScore,
    })),
    requirements,
    assessments,
  });

  const before = new Set(applicationIds);
  const after = new Set(ordered.map((row) => row.applicationId));
  if (before.size !== after.size || [...before].some((id) => !after.has(id))) {
    throw new M11RerankError("Rerank changed the M10 candidate set.", M11_BASELINE_INCOMPATIBLE);
  }

  return {
    hybridRunId: hybrid.id,
    jobId: job.id,
    companyId: job.companyId,
    rerankVersion: M11_RERANK_VERSION,
    results: ordered,
  };
}

export async function rerankM10ForAdmin(jobIdInput: unknown, hybridRunIdInput: unknown) {
  await requireM11Admin();
  return executeM11Rerank({
    jobId: validateM11PositiveId(jobIdInput, "Job"),
    hybridRunId: validateM11PositiveId(hybridRunIdInput, "M10 run"),
  });
}
