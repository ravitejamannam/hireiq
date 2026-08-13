"use server";

import {
  AuthorizationError,
  requireAdmin,
  requireClientPortal,
} from "@/lib/auth/authorization";
import { generateBillingForHiredApplication } from "@/lib/billing/generate-hire-billing";
import { prisma } from "@/lib/prisma";
import {
  assertApplicationIsInExpertReview,
  assertJobAllowsSourcingIntake,
  ensureApplicationExists,
  validateApplicationId,
  validateApplicationInput,
  validateExpertReviewNotes,
  validateExpertReviewScore,
  validateRequiredApplicationSource,
  validateSourcedCandidateInput,
  validateSourcingJobId,
  ApplicationValidationError,
  ApplicationTenantIntegrityError,
  type SourcedCandidateInput,
} from "@/lib/validation/application-validation";
import { BillingValidationError } from "@/lib/validation/billing-validation";
import { revalidatePath } from "next/cache";
import {
  ApplicationPipelineStatus,
  CandidateStatus,
  Prisma,
  SourcingDatabaseSource,
} from "@prisma/client";

export async function createApplication(
  candidateId: number,
  jobId: number,
  status: ApplicationPipelineStatus = ApplicationPipelineStatus.CV_POOL,
  source: SourcingDatabaseSource | null = null,
  expertScore: number | null = null,
  rejectionReason: string | null = null,
) {
  await requireAdmin();
  const applicationInput = await validateApplicationInput(
    candidateId,
    jobId,
    status,
    source,
    expertScore,
    rejectionReason,
  );

  if (applicationInput.status === ApplicationPipelineStatus.HIRED) {
    throw new ApplicationValidationError(
      "Hiring must be confirmed by the client who owns this requirement.",
    );
  }

  try {
    const application = await prisma.application.create({
      data: applicationInput,
    });

    revalidatePath("/dashboard/applications");

    return application;
  } catch (error) {
    throw translateApplicationSaveError(error);
  }
}

export async function updateApplication(
  id: number,
  candidateId: number,
  jobId: number,
  status: ApplicationPipelineStatus,
  source: SourcingDatabaseSource | null = null,
  expertScore: number | null = null,
  rejectionReason: string | null = null,
) {
  await requireAdmin();
  const applicationId = validateApplicationId(id);
  await ensureApplicationExists(applicationId);

  const existingApplication = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { status: true },
  });

  if (!existingApplication) {
    throw new ApplicationValidationError("Application not found.");
  }

  const applicationInput = await validateApplicationInput(
    candidateId,
    jobId,
    status,
    source,
    expertScore,
    rejectionReason,
  );

  if (
    applicationInput.status === ApplicationPipelineStatus.HIRED &&
    existingApplication.status !== ApplicationPipelineStatus.HIRED
  ) {
    throw new ApplicationValidationError(
      "Hiring must be confirmed by the client who owns this requirement.",
    );
  }

  try {
    const application = await prisma.application.update({
      where: {
        id: applicationId,
      },
      data: applicationInput,
    });

    revalidatePath("/dashboard/applications");

    return application;
  } catch (error) {
    throw translateApplicationSaveError(error);
  }
}

export async function deleteApplication(id: number) {
  await requireAdmin();
  const applicationId = validateApplicationId(id);
  await ensureApplicationExists(applicationId);

  try {
    await prisma.application.delete({
      where: {
        id: applicationId,
      },
    });

    revalidatePath("/dashboard/applications");
  } catch (error) {
    throw translateApplicationDeleteError(error);
  }
}

const APPLICATION_STATUS_TRANSITIONS: Record<
  ApplicationPipelineStatus,
  ApplicationPipelineStatus[]
> = {
  [ApplicationPipelineStatus.CV_POOL]: [
    ApplicationPipelineStatus.EXPERT_REVIEW,
    ApplicationPipelineStatus.REJECTED,
  ],
  [ApplicationPipelineStatus.EXPERT_REVIEW]: [
    ApplicationPipelineStatus.TECH_EVALUATION,
    ApplicationPipelineStatus.REJECTED,
  ],
  [ApplicationPipelineStatus.TECH_EVALUATION]: [
    ApplicationPipelineStatus.SHORTLISTED,
    ApplicationPipelineStatus.REJECTED,
  ],
  [ApplicationPipelineStatus.SHORTLISTED]: [
    ApplicationPipelineStatus.SELECTED,
    ApplicationPipelineStatus.REJECTED,
  ],
  // SELECTED → HIRED is Client-owned (confirmClientCandidateHire), not Admin.
  [ApplicationPipelineStatus.SELECTED]: [],
  [ApplicationPipelineStatus.REJECTED]: [],
  [ApplicationPipelineStatus.HIRED]: [],
};

function getValidApplicationStatusTransitions(
  currentStatus: ApplicationPipelineStatus,
) {
  return APPLICATION_STATUS_TRANSITIONS[currentStatus] ?? [];
}

function isApplicationPipelineStatus(
  status: unknown,
): status is ApplicationPipelineStatus {
  return (
    typeof status === "string" &&
    Object.values(ApplicationPipelineStatus).includes(
      status as ApplicationPipelineStatus,
    )
  );
}

export async function createSourcedApplication(
  jobId: number,
  candidateInput: SourcedCandidateInput,
  source: SourcingDatabaseSource,
) {
  await requireAdmin();
  const validatedJobId = validateSourcingJobId(jobId);
  const validatedCandidate = validateSourcedCandidateInput(candidateInput);
  const validatedSource = validateRequiredApplicationSource(source);

  const job = await prisma.job.findUnique({
    where: {
      id: validatedJobId,
    },
    select: {
      id: true,
      companyId: true,
      requirementLifecycle: true,
      sourcingAccessReceivedAt: true,
    },
  });

  if (!job) {
    throw new ApplicationValidationError("Job not found.");
  }

  assertJobAllowsSourcingIntake(job);

  let result;

  try {
    result = await prisma.$transaction(async (tx) => {
      const candidate = await tx.candidate.create({
        data: {
          name: validatedCandidate.name,
          role: validatedCandidate.role,
          experienceYears: validatedCandidate.experienceYears,
          location: validatedCandidate.location,
          currentEmployer: validatedCandidate.currentEmployer,
          skills: validatedCandidate.skills,
          expectedCTC: validatedCandidate.expectedCTC,
          status: CandidateStatus.APPLIED,
          companyId: job.companyId,
        },
      });

      const application = await tx.application.create({
        data: {
          candidateId: candidate.id,
          jobId: job.id,
          companyId: job.companyId,
          status: ApplicationPipelineStatus.CV_POOL,
          source: validatedSource,
          expertScore: null,
          rejectionReason: null,
        },
      });

      return {
        candidate,
        application,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ApplicationValidationError(
        "Candidate is already in this requirement pipeline.",
      );
    }

    if (error instanceof ApplicationValidationError) {
      throw error;
    }

    throw translateApplicationSaveError(error);
  }

  try {
    revalidatePath("/dashboard/sourcing");
    revalidatePath("/dashboard/applications");
    revalidatePath("/dashboard/pipeline");
    revalidatePath("/dashboard/candidates");
    revalidatePath("/dashboard/jobs");
  } catch {
    // revalidatePath requires a Next.js request context
  }

  return result;
}

export async function saveExpertReview(
  applicationId: number,
  expertScore: number | null,
  notes: string | null,
) {
  await requireAdmin();
  const validatedApplicationId = validateApplicationId(applicationId);
  const validatedExpertScore = validateExpertReviewScore(expertScore);
  const validatedNotes = validateExpertReviewNotes(notes);

  if (validatedExpertScore === null && validatedNotes === null) {
    throw new ApplicationValidationError("No review changes to save.");
  }

  const application = await prisma.application.findUnique({
    where: {
      id: validatedApplicationId,
    },
    select: {
      id: true,
      status: true,
      candidateId: true,
      jobId: true,
      expertScore: true,
      candidate: {
        select: {
          id: true,
          companyId: true,
        },
      },
      job: {
        select: {
          id: true,
          companyId: true,
          assignedInterviewerId: true,
        },
      },
    },
  });

  if (!application) {
    throw new ApplicationValidationError("Application not found.");
  }

  if (!application.job) {
    throw new ApplicationValidationError("Job not found.");
  }

  if (application.candidate.companyId !== application.job.companyId) {
    throw new ApplicationValidationError(
      "Candidate and job must belong to the same company.",
    );
  }

  assertApplicationIsInExpertReview(application.status);

  if (!application.job.assignedInterviewerId) {
    throw new ApplicationValidationError(
      "Interviewer must be assigned before expert review.",
    );
  }

  const assignedInterviewerId = application.job.assignedInterviewerId;

  let result;

  try {
    result = await prisma.$transaction(async (tx) => {
      const updatedApplication = await tx.application.update({
        where: {
          id: application.id,
        },
        data: {
          expertScore: validatedExpertScore,
        },
      });

      const existingEvaluation = await tx.evaluation.findFirst({
        where: {
          applicationId: application.id,
          interviewerId: assignedInterviewerId,
        },
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
        },
      });

      let evaluation = null;

      if (existingEvaluation) {
        evaluation = await tx.evaluation.update({
          where: {
            id: existingEvaluation.id,
          },
          data: {
            notes: validatedNotes,
          },
        });
      } else if (validatedNotes !== null) {
        evaluation = await tx.evaluation.create({
          data: {
            applicationId: application.id,
            interviewerId: assignedInterviewerId,
            notes: validatedNotes,
          },
        });
      }

      return {
        application: updatedApplication,
        evaluation,
      };
    });
  } catch (error) {
    if (error instanceof ApplicationValidationError) {
      throw error;
    }

    throw translateApplicationSaveError(error);
  }

  try {
    revalidatePath("/dashboard/expert-review");
    revalidatePath("/dashboard/pipeline");
    revalidatePath("/dashboard/applications");
    revalidatePath("/dashboard/evaluations");
  } catch {
    // revalidatePath requires a Next.js request context
  }

  return result;
}

export async function transitionApplicationStatus(
  id: number,
  nextStatus: ApplicationPipelineStatus,
) {
  await requireAdmin();
  const applicationId = validateApplicationId(id);

  if (!isApplicationPipelineStatus(nextStatus)) {
    throw new Error("Application status is invalid.");
  }

  const application = await prisma.application.findUnique({
    where: {
      id: applicationId,
    },
    select: {
      id: true,
      status: true,
      jobId: true,
    },
  });

  if (!application) {
    throw new Error("Application not found.");
  }

  if (
    application.status === ApplicationPipelineStatus.SELECTED &&
    nextStatus === ApplicationPipelineStatus.HIRED
  ) {
    throw new ApplicationValidationError(
      "Hiring must be confirmed by the client who owns this requirement.",
    );
  }

  const allowedTransitions = getValidApplicationStatusTransitions(
    application.status,
  );

  if (!allowedTransitions.includes(nextStatus)) {
    throw new Error("Invalid application status transition.");
  }

  const isSelectionTransition =
    application.status === ApplicationPipelineStatus.SHORTLISTED &&
    nextStatus === ApplicationPipelineStatus.SELECTED;

  let updatedApplication;

  try {
    if (isSelectionTransition) {
      // SHORTLISTED → SELECTED is a decision only — no billing.
      updatedApplication = await prisma.$transaction(async (tx) => {
        const updateResult = await tx.application.updateMany({
          where: {
            id: application.id,
            status: ApplicationPipelineStatus.SHORTLISTED,
          },
          data: {
            status: ApplicationPipelineStatus.SELECTED,
          },
        });

        if (updateResult.count !== 1) {
          throw new ApplicationValidationError(
            "Candidate is no longer shortlisted.",
          );
        }

        return tx.application.findUniqueOrThrow({
          where: { id: application.id },
        });
      });
    } else {
      updatedApplication = await prisma.application.update({
        where: {
          id: applicationId,
        },
        data: {
          status: nextStatus,
        },
      });
    }
  } catch (error) {
    if (error instanceof ApplicationValidationError) {
      throw error;
    }
    if (error instanceof BillingValidationError) {
      throw error;
    }
    throw translateApplicationSaveError(error);
  }

  try {
    revalidatePath("/dashboard/pipeline");
    revalidatePath("/dashboard/applications");
    revalidatePath("/dashboard/shortlist");
    revalidatePath("/dashboard/billing");
    if (application.jobId) {
      revalidatePath(`/dashboard/requirements/${application.jobId}`);
      revalidatePath("/client/billing");
      revalidatePath(`/client/requirements/${application.jobId}/billing`);
    }
  } catch {
    // revalidatePath requires a Next.js request context
  }

  return updatedApplication;
}

/**
 * Client-only selection: SHORTLISTED → SELECTED for an Application
 * owned by the Client's company. Does not accept nextStatus from the browser.
 * Selection is a decision only — billing is generated when the Client confirms hire.
 */
export async function selectClientCandidate(applicationId: number) {
  const client = await requireClientPortal();
  const validatedApplicationId = validateApplicationId(applicationId);

  const application = await prisma.application.findFirst({
    where: {
      id: validatedApplicationId,
      job: {
        companyId: client.companyId,
      },
    },
    select: {
      id: true,
      status: true,
      jobId: true,
      companyId: true,
    },
  });

  if (!application) {
    throw new AuthorizationError("Resource not found.");
  }

  if (application.status !== ApplicationPipelineStatus.SHORTLISTED) {
    throw new ApplicationValidationError(
      "Candidate is no longer shortlisted.",
    );
  }

  let updatedApplication;

  try {
    updatedApplication = await prisma.$transaction(async (tx) => {
      // Conditional update prevents double-submit races from selecting twice.
      const updateResult = await tx.application.updateMany({
        where: {
          id: application.id,
          status: ApplicationPipelineStatus.SHORTLISTED,
          companyId: client.companyId,
          job: {
            companyId: client.companyId,
          },
        },
        data: {
          status: ApplicationPipelineStatus.SELECTED,
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationValidationError(
          "Candidate is no longer shortlisted.",
        );
      }

      return tx.application.findUniqueOrThrow({
        where: { id: application.id },
      });
    });
  } catch (error) {
    if (error instanceof ApplicationValidationError) {
      throw error;
    }
    if (error instanceof AuthorizationError) {
      throw error;
    }
    throw translateApplicationSaveError(error);
  }

  try {
    revalidatePath("/client");
    revalidatePath("/client/requirements");
    revalidatePath(`/client/requirements/${application.jobId}`);
    revalidatePath(`/client/requirements/${application.jobId}/shortlist`);
    revalidatePath(
      `/client/requirements/${application.jobId}/candidates/${application.id}`,
    );
    revalidatePath("/dashboard/pipeline");
    revalidatePath("/dashboard/shortlist");
    revalidatePath("/dashboard/applications");
    revalidatePath(`/dashboard/requirements/${application.jobId}`);
  } catch {
    // revalidatePath requires a Next.js request context
  }

  return updatedApplication;
}

/**
 * Client-only hire confirmation: SELECTED → HIRED for an Application
 * owned by the Client's company. Does not accept nextStatus from the browser.
 * Hire + billing + BILLING_GENERATED commit atomically.
 */
export async function confirmClientCandidateHire(applicationId: number) {
  const client = await requireClientPortal();
  const validatedApplicationId = validateApplicationId(applicationId);

  const application = await prisma.application.findFirst({
    where: {
      id: validatedApplicationId,
      companyId: client.companyId,
      job: {
        companyId: client.companyId,
      },
    },
    select: {
      id: true,
      status: true,
      jobId: true,
      companyId: true,
    },
  });

  if (!application) {
    throw new AuthorizationError("Resource not found.");
  }

  if (application.status !== ApplicationPipelineStatus.SELECTED) {
    throw new ApplicationValidationError(
      "Candidate must be selected before hire can be confirmed.",
    );
  }

  let updatedApplication;

  try {
    updatedApplication = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.application.updateMany({
        where: {
          id: application.id,
          status: ApplicationPipelineStatus.SELECTED,
          companyId: client.companyId,
          job: {
            companyId: client.companyId,
          },
        },
        data: {
          status: ApplicationPipelineStatus.HIRED,
        },
      });

      if (updateResult.count !== 1) {
        throw new ApplicationValidationError(
          "Candidate is no longer selected.",
        );
      }

      await generateBillingForHiredApplication(tx, application.id);

      return tx.application.findUniqueOrThrow({
        where: { id: application.id },
      });
    });
  } catch (error) {
    if (error instanceof ApplicationValidationError) {
      throw error;
    }
    if (error instanceof BillingValidationError) {
      throw error;
    }
    if (error instanceof AuthorizationError) {
      throw error;
    }
    throw translateApplicationSaveError(error);
  }

  try {
    revalidatePath("/client");
    revalidatePath("/client/requirements");
    revalidatePath(`/client/requirements/${application.jobId}`);
    revalidatePath(`/client/requirements/${application.jobId}/shortlist`);
    revalidatePath(
      `/client/requirements/${application.jobId}/candidates/${application.id}`,
    );
    revalidatePath(`/client/requirements/${application.jobId}/billing`);
    revalidatePath("/client/billing");
    revalidatePath("/dashboard/pipeline");
    revalidatePath("/dashboard/shortlist");
    revalidatePath("/dashboard/applications");
    revalidatePath("/dashboard/billing");
    revalidatePath(`/dashboard/requirements/${application.jobId}`);
  } catch {
    // revalidatePath requires a Next.js request context
  }

  return updatedApplication;
}

function translateApplicationSaveError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return new Error("Application already exists for this candidate and job.");
    }

    if (error.code === "P2003") {
      // Composite FKs reject Candidate/Job company mismatches as FK violations.
      return new ApplicationTenantIntegrityError();
    }

    if (error.code === "P2025") {
      return new Error("Application not found.");
    }
  }

  return new Error("Unable to save application.");
}

function translateApplicationDeleteError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003") {
      return new Error(
        "Cannot modify or delete this application because related records exist.",
      );
    }

    if (error.code === "P2025") {
      return new Error("Application not found.");
    }
  }

  return new Error("Unable to delete application.");
}
