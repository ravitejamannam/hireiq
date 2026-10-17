"use server";

import { notifyCandidateOfStageChange } from "@/lib/candidates/stage-change-emails";
import { dispatchWebhookEvent } from "@/lib/interviews/webhook-dispatch";
import { scheduleBackgroundWork } from "@/lib/communication/schedule-background";

import {
  AuthorizationError,
  requireAdmin,
  requireClientPortal,
  requireInterviewerPortal,
} from "@/lib/auth/authorization";
import { clientMayConfirmHire } from "@/lib/hiring/hire-confirmation-auth";
import { generateBillingForHiredApplication } from "@/lib/billing/generate-hire-billing";
import { prisma } from "@/lib/prisma";
import {
  CLIENT_HIRING_REQUIREMENT_LIFECYCLES,
  getValidInterviewerPipelineTransitions,
} from "@/lib/validation/application-pipeline";
import {
  assertApplicationIsInExpertReview,
  assertAdminPipelineTransition,
  assertApplicationCreatedAtCvPool,
  assertJobAllowsClientHire,
  assertJobAllowsClientSelection,
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
import { commitApplicationStatusChange } from "@/lib/outcomes/outcome-event-writes";
import { revalidatePath } from "next/cache";
import {
  ApplicationPipelineStatus,
  CandidateStatus,
  OutcomeEventActorType,
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
  const createStatus = assertApplicationCreatedAtCvPool(status);
  const applicationInput = await validateApplicationInput(
    candidateId,
    jobId,
    createStatus,
    source,
    expertScore,
    rejectionReason,
  );

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
  const admin = await requireAdmin();
  const applicationId = validateApplicationId(id);
  await ensureApplicationExists(applicationId);

  const existingApplication = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { status: true, shortlistedAt: true },
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

  assertAdminPipelineTransition(
    existingApplication.status,
    applicationInput.status,
  );

  try {
    const application = await prisma.$transaction(async (tx) => {
      const updated = await commitApplicationStatusChange(tx, {
        applicationId,
        expectedStatus: existingApplication.status,
        nextStatus: applicationInput.status,
        actorUserId: admin.id,
        actorType: OutcomeEventActorType.ADMIN,
        patch: {
          candidateId: applicationInput.candidateId,
          jobId: applicationInput.jobId,
          companyId: applicationInput.companyId,
          source: applicationInput.source,
          expertScore: applicationInput.expertScore,
          rejectionReason: applicationInput.rejectionReason,
        },
      });
      if (!updated) {
        throw new ApplicationValidationError(
          "Candidate is no longer in the expected pipeline state.",
        );
      }
      return updated;
    });

    revalidatePath("/dashboard/applications");

    return application;
  } catch (error) {
    if (error instanceof ApplicationValidationError) throw error;
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
  rejectionReason?: string,
) {
  const admin = await requireAdmin();
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
      companyId: true,
      shortlistedAt: true,
    },
  });

  if (!application) {
    throw new Error("Application not found.");
  }

  const companyId = application.companyId;

  assertAdminPipelineTransition(application.status, nextStatus);
  // Admin pipeline ownership: [ApplicationPipelineStatus.SELECTED]: [],

  let updatedApplication;

  try {
    updatedApplication = await prisma.$transaction(async (tx) => {
      const updated = await commitApplicationStatusChange(tx, {
        applicationId: application.id,
        expectedStatus: application.status,
        nextStatus,
        actorUserId: admin.id,
        actorType: OutcomeEventActorType.ADMIN,
        actorRole: "ADMIN",
        patch: rejectionReason ? { rejectionReason } : {},
      });
      if (!updated) {
        throw new ApplicationValidationError(
          "Candidate is no longer in the expected pipeline state.",
        );
      }
      return updated;
    });
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

  emitPipelineSideEffects({
    applicationId,
    companyId,
    previousStatus: application.status,
    nextStatus,
  });

  return updatedApplication;
}

/**
 * Interviewer pipeline for assigned requirements.
 * TECH_EVALUATION → SHORTLISTED | REJECTED only.
 * Does not accept SELECTED or HIRED.
 */
export async function transitionInterviewerApplicationStatus(
  id: number,
  nextStatus: ApplicationPipelineStatus,
) {
  const interviewer = await requireInterviewerPortal();
  const applicationId = validateApplicationId(id);

  if (!isApplicationPipelineStatus(nextStatus)) {
    throw new Error("Application status is invalid.");
  }

  if (
    nextStatus === ApplicationPipelineStatus.SELECTED ||
    nextStatus === ApplicationPipelineStatus.HIRED
  ) {
    throw new ApplicationValidationError(
      nextStatus === ApplicationPipelineStatus.HIRED
        ? "Hiring must be confirmed by the client who owns this requirement."
        : "Selection must be confirmed by the client who owns this requirement.",
    );
  }

  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      job: {
        assignedInterviewerId: interviewer.interviewerId,
      },
    },
    select: {
      id: true,
      status: true,
      jobId: true,
      companyId: true,
      shortlistedAt: true,
      job: {
        select: {
          assignedInterviewerId: true,
        },
      },
    },
  });

  if (!application) {
    throw new AuthorizationError("Resource not found.");
  }

  if (nextStatus === ApplicationPipelineStatus.REJECTED) {
    throw new ApplicationValidationError(
      "Rejection must be confirmed by the client who owns this requirement.",
    );
  }

  const allowedTransitions = getValidInterviewerPipelineTransitions(
    application.status,
  );

  if (!allowedTransitions.includes(nextStatus)) {
    throw new ApplicationValidationError(
      "Invalid application status transition.",
    );
  }

  let updatedApplication;

  try {
    updatedApplication = await prisma.$transaction(async (tx) => {
      const stillAssigned = await tx.application.findFirst({
        where: {
          id: application.id,
          status: application.status,
          job: { assignedInterviewerId: interviewer.interviewerId },
        },
        select: { id: true },
      });
      if (!stillAssigned) {
        throw new ApplicationValidationError(
          "Candidate is no longer in the expected pipeline state.",
        );
      }
      const updated = await commitApplicationStatusChange(tx, {
        applicationId: application.id,
        expectedStatus: application.status,
        nextStatus,
        actorUserId: interviewer.id,
        actorType: OutcomeEventActorType.INTERVIEWER,
        actorRole: "INTERVIEWER",
      });
      if (!updated) {
        throw new ApplicationValidationError(
          "Candidate is no longer in the expected pipeline state.",
        );
      }
      return updated;
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
    revalidatePath("/interviewer");
    revalidatePath("/interviewer/requirements");
    revalidatePath(`/interviewer/requirements/${application.jobId}`);
    revalidatePath(
      `/interviewer/requirements/${application.jobId}/candidates/${application.id}`,
    );
    revalidatePath("/interviewer/candidates");
    revalidatePath("/interviewer/evaluations");
    revalidatePath("/dashboard/pipeline");
    revalidatePath("/dashboard/shortlist");
    revalidatePath("/dashboard/technical-evaluations");
    revalidatePath("/dashboard/applications");
    revalidatePath(`/dashboard/requirements/${application.jobId}`);
  } catch {
    // revalidatePath requires a Next.js request context
  }

  emitPipelineSideEffects({
    applicationId: application.id,
    companyId: application.companyId,
    previousStatus: application.status,
    nextStatus,
  });

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
      job: {
        select: {
          requirementLifecycle: true,
        },
      },
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

  assertJobAllowsClientSelection(application.job.requirementLifecycle);

  let updatedApplication;

  try {
    updatedApplication = await prisma.$transaction(async (tx) => {
      // Conditional update prevents double-submit races from selecting twice.
      const stillShortlisted = await tx.application.findFirst({
        where: {
          id: application.id,
          status: ApplicationPipelineStatus.SHORTLISTED,
          companyId: client.companyId,
          job: {
            companyId: client.companyId,
            requirementLifecycle: {
              in: CLIENT_HIRING_REQUIREMENT_LIFECYCLES,
            },
          },
        },
        select: { id: true },
      });
      if (!stillShortlisted) {
        throw new ApplicationValidationError(
          "Candidate is no longer shortlisted.",
        );
      }
      const updated = await commitApplicationStatusChange(tx, {
        applicationId: application.id,
        expectedStatus: ApplicationPipelineStatus.SHORTLISTED,
        nextStatus: ApplicationPipelineStatus.SELECTED,
        actorUserId: client.id,
        actorType: OutcomeEventActorType.CLIENT,
        actorRole: client.membershipRole,
      });
      if (!updated) {
        throw new ApplicationValidationError(
          "Candidate is no longer shortlisted.",
        );
      }
      return updated;
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

  emitPipelineSideEffects({
    applicationId: application.id,
    companyId: application.companyId,
    previousStatus: application.status,
    nextStatus: ApplicationPipelineStatus.SELECTED,
  });

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
      job: {
        select: {
          requirementLifecycle: true,
        },
      },
    },
  });

  if (!application) {
    throw new AuthorizationError("Resource not found.");
  }

  if (!(await clientMayConfirmHire(client))) {
    throw new AuthorizationError("Unauthorized.");
  }

  if (application.status !== ApplicationPipelineStatus.SELECTED) {
    throw new ApplicationValidationError(
      "Candidate must be selected before hire can be confirmed.",
    );
  }

  assertJobAllowsClientHire(application.job.requirementLifecycle);

  let updatedApplication;

  try {
    updatedApplication = await prisma.$transaction(async (tx) => {
      const stillSelected = await tx.application.findFirst({
        where: {
          id: application.id,
          status: ApplicationPipelineStatus.SELECTED,
          companyId: client.companyId,
          job: {
            companyId: client.companyId,
            requirementLifecycle: {
              in: CLIENT_HIRING_REQUIREMENT_LIFECYCLES,
            },
          },
        },
        select: { id: true },
      });
      if (!stillSelected) {
        throw new ApplicationValidationError(
          "Candidate is no longer selected.",
        );
      }
      const updated = await commitApplicationStatusChange(tx, {
        applicationId: application.id,
        expectedStatus: ApplicationPipelineStatus.SELECTED,
        nextStatus: ApplicationPipelineStatus.HIRED,
        actorUserId: client.id,
        actorType: OutcomeEventActorType.CLIENT,
        actorRole: client.membershipRole,
      });
      if (!updated) {
        throw new ApplicationValidationError(
          "Candidate is no longer selected.",
        );
      }

      await generateBillingForHiredApplication(tx, application.id);

      return updated;
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

  emitPipelineSideEffects({
    applicationId: application.id,
    companyId: application.companyId,
    previousStatus: application.status,
    nextStatus: ApplicationPipelineStatus.HIRED,
  });

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

function emitPipelineSideEffects(input: {
  applicationId: number;
  companyId: number;
  previousStatus: string;
  nextStatus: ApplicationPipelineStatus;
}) {
  scheduleBackgroundWork(async () => {
    await notifyCandidateOfStageChange(input.applicationId, input.nextStatus);
    await dispatchWebhookEvent({
      event: "application.status_changed",
      companyId: input.companyId,
      data: {
        applicationId: input.applicationId,
        previousStatus: input.previousStatus,
        newStatus: input.nextStatus,
        changedAt: new Date().toISOString(),
      },
    });
  });
}

/**
 * Bulk pipeline transitions (T118): apply a stage change to many
 * applications at once. ADMIN only. Each application is validated
 * individually — invalid transitions are skipped, not fatal.
 */
export async function bulkTransitionApplications({
  ids,
  nextStatus,
  rejectionReason,
}: {
  ids: number[];
  nextStatus: "SHORTLISTED" | "REJECTED";
  rejectionReason?: string;
}): Promise<{ updated: number; skipped: number }> {
  await requireAdmin();

  if (nextStatus === "REJECTED" && !rejectionReason?.trim()) {
    throw new Error("A rejection reason is required.");
  }

  let updated = 0;
  let skipped = 0;

  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0) {
      skipped += 1;
      continue;
    }
    try {
      await transitionApplicationStatus(id, nextStatus, rejectionReason);
      updated += 1;
    } catch {
      skipped += 1;
    }
  }

  revalidatePath("/dashboard/pipeline");
  return { updated, skipped };
}
