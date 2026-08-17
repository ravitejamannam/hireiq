import { JobSpecificationVersionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  JOB_SPECIFICATION_SCALAR_SELECT,
  readEditableJobSpecification,
} from "@/lib/jobs/job-specification";
import { validateJobRequirementCompletion } from "@/lib/validation/job-specification-validation";
import { JobValidationError } from "@/lib/validation/job-validation";

export const CLIENT_REQUIREMENT_NOT_SUBMITTABLE_ERROR =
  "Requirement is not available for submission.";

export const CLIENT_REQUIREMENT_SUBMIT_STALE_ERROR =
  "Requirement is no longer available for submission.";

/**
 * Client-owned lifecycle transition: REQUIREMENT_DRAFTED → CLIENT_NOTIFIED.
 * Completeness uses the T81 canonical validator. Does not publish, complete,
 * or plant workflow timestamps. companyId must already be membership-derived.
 */
export async function submitClientRequirementForCompany(input: {
  jobId: number;
  companyId: number;
}) {
  const job = await prisma.job.findFirst({
    where: {
      id: input.jobId,
      companyId: input.companyId,
    },
    select: {
      id: true,
      companyId: true,
      requirementLifecycle: true,
      currentPublishedSpecificationVersionId: true,
      ...JOB_SPECIFICATION_SCALAR_SELECT,
      currentPublishedSpecificationVersion: {
        select: JOB_SPECIFICATION_SCALAR_SELECT,
      },
      specificationVersions: {
        where: {
          status: JobSpecificationVersionStatus.DRAFT,
        },
        take: 1,
        select: JOB_SPECIFICATION_SCALAR_SELECT,
      },
    },
  });

  if (!job) {
    throw new JobValidationError("Requirement not found.");
  }

  if (job.requirementLifecycle !== "REQUIREMENT_DRAFTED") {
    throw new JobValidationError(CLIENT_REQUIREMENT_NOT_SUBMITTABLE_ERROR);
  }

  validateJobRequirementCompletion(readEditableJobSpecification(job));

  const transition = await prisma.job.updateMany({
    where: {
      id: input.jobId,
      companyId: input.companyId,
      requirementLifecycle: "REQUIREMENT_DRAFTED",
    },
    data: {
      requirementLifecycle: "CLIENT_NOTIFIED",
    },
  });

  if (transition.count !== 1) {
    throw new JobValidationError(CLIENT_REQUIREMENT_SUBMIT_STALE_ERROR);
  }

  return prisma.job.findUniqueOrThrow({
    where: {
      id: input.jobId,
    },
  });
}
