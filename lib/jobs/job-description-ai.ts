import {
  JobDescriptionAiGenerationStatus,
  JobSpecificationVersionStatus,
} from "@prisma/client";

import {
  generateJobDescriptionFromProvider,
  getJobDescriptionAiModel,
  getJobDescriptionAiProviderLabel,
} from "@/lib/ai/job-description-generator";
import {
  JOB_DESCRIPTION_AI_IN_PROGRESS_ERROR,
  JOB_DESCRIPTION_AI_NO_DRAFT_ERROR,
  JOB_DESCRIPTION_AI_NO_PROPOSAL_ERROR,
  JOB_DESCRIPTION_AI_UNCHANGED_ERROR,
  JobDescriptionAiError,
} from "@/lib/ai/job-description-output";
import { buildJobDescriptionAiInput } from "@/lib/ai/job-description-prompt";
import {
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForJob,
  rateLimitKeyForUser,
} from "@/lib/auth/rate-limit";
import {
  JOB_SPECIFICATION_SCALAR_SELECT,
  specFieldsFromRecord,
} from "@/lib/jobs/job-specification";
import { prisma } from "@/lib/prisma";
import { JobValidationError } from "@/lib/validation/job-validation";

export type JobDescriptionAiActor = {
  userId: number;
  companyId: number | null;
  isAdmin: boolean;
};

function logAiEvent(
  event:
    | "ai_job_description_started"
    | "ai_job_description_completed"
    | "ai_job_description_failed"
    | "ai_job_description_accepted"
    | "ai_job_description_discarded",
  metadata: Record<string, unknown>,
) {
  console.log(`[ai] ${event}`, metadata);
}

async function loadScopedJob(input: {
  jobId: number;
  actor: JobDescriptionAiActor;
}) {
  const job = await prisma.job.findFirst({
    where: {
      id: input.jobId,
      ...(input.actor.isAdmin
        ? {}
        : { companyId: input.actor.companyId ?? -1 }),
    },
    select: {
      id: true,
      companyId: true,
      requirementLifecycle: true,
      clientCompletedAt: true,
      sourcingAccessReceivedAt: true,
      shortlistingDueAt: true,
      shortlistingCompletedAt: true,
      assignedInterviewerId: true,
      currentPublishedSpecificationVersionId: true,
      ...JOB_SPECIFICATION_SCALAR_SELECT,
    },
  });

  if (!job) {
    throw new JobValidationError("Requirement not found.");
  }

  return job;
}

async function loadDraftOrThrow(jobId: number) {
  const draft = await prisma.jobSpecificationVersion.findFirst({
    where: {
      jobId,
      status: JobSpecificationVersionStatus.DRAFT,
    },
  });

  if (!draft) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_NO_DRAFT_ERROR);
  }

  return draft;
}

export async function generateJobDescriptionForActor(input: {
  jobId: number;
  actor: JobDescriptionAiActor;
}) {
  const job = await loadScopedJob(input);
  const draft = await loadDraftOrThrow(job.id);

  await consumeAuthRateLimit({
    name: "aiJobDescriptionUser",
    key: rateLimitKeyForUser(input.actor.userId),
  });
  await consumeAuthRateLimit({
    name: "aiJobDescriptionJob",
    key: rateLimitKeyForJob(job.id),
  });

  const claimed = await prisma.jobSpecificationVersion.updateMany({
    where: {
      id: draft.id,
      status: JobSpecificationVersionStatus.DRAFT,
      aiGenerationStatus: {
        not: JobDescriptionAiGenerationStatus.GENERATING,
      },
    },
    data: {
      aiGenerationStatus: JobDescriptionAiGenerationStatus.GENERATING,
    },
  });

  if (claimed.count !== 1) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_IN_PROGRESS_ERROR);
  }

  const startedAt = Date.now();
  const provider = getJobDescriptionAiProviderLabel();
  const model = getJobDescriptionAiModel();
  logAiEvent("ai_job_description_started", {
    userId: input.actor.userId,
    jobId: job.id,
    provider,
    model,
  });

  try {
    const proposal = await generateJobDescriptionFromProvider(
      buildJobDescriptionAiInput({
        ...specFieldsFromRecord(draft),
        structuredPayload: draft.structuredPayload,
      }),
    );

    const stored = await prisma.jobSpecificationVersion.updateMany({
      where: {
        id: draft.id,
        status: JobSpecificationVersionStatus.DRAFT,
        aiGenerationStatus: JobDescriptionAiGenerationStatus.GENERATING,
      },
      data: {
        aiProposedJobDescription: proposal.jobDescription,
        aiGeneratedAt: new Date(),
        aiGenerationStatus: JobDescriptionAiGenerationStatus.READY,
      },
    });

    if (stored.count !== 1) {
      throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
    }

    logAiEvent("ai_job_description_completed", {
      userId: input.actor.userId,
      jobId: job.id,
      provider,
      model,
      durationMs: Date.now() - startedAt,
      success: true,
    });

    return prisma.jobSpecificationVersion.findUniqueOrThrow({
      where: { id: draft.id },
    });
  } catch (error) {
    await prisma.jobSpecificationVersion.updateMany({
      where: {
        id: draft.id,
        status: JobSpecificationVersionStatus.DRAFT,
        aiGenerationStatus: JobDescriptionAiGenerationStatus.GENERATING,
      },
      data: {
        aiGenerationStatus: JobDescriptionAiGenerationStatus.FAILED,
      },
    });

    logAiEvent("ai_job_description_failed", {
      userId: input.actor.userId,
      jobId: job.id,
      provider,
      model,
      durationMs: Date.now() - startedAt,
      success: false,
    });

    if (
      error instanceof JobDescriptionAiError ||
      error instanceof JobValidationError ||
      error instanceof RateLimitError
    ) {
      throw error;
    }

    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
  }
}

export async function acceptGeneratedJobDescriptionForActor(input: {
  jobId: number;
  actor: JobDescriptionAiActor;
}) {
  const job = await loadScopedJob(input);
  const draft = await loadDraftOrThrow(job.id);

  if (
    draft.aiGenerationStatus !== JobDescriptionAiGenerationStatus.READY ||
    !draft.aiProposedJobDescription?.trim()
  ) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_NO_PROPOSAL_ERROR);
  }

  const acceptedDescription = draft.aiProposedJobDescription.trim();

  const updated = await prisma.jobSpecificationVersion.updateMany({
    where: {
      id: draft.id,
      status: JobSpecificationVersionStatus.DRAFT,
      aiGenerationStatus: JobDescriptionAiGenerationStatus.READY,
    },
    data: {
      jobDescription: acceptedDescription,
      aiProposedJobDescription: null,
      aiGeneratedAt: null,
      aiGenerationStatus: JobDescriptionAiGenerationStatus.NONE,
    },
  });

  if (updated.count !== 1) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_NO_PROPOSAL_ERROR);
  }

  await prisma.job.update({
    where: { id: job.id },
    data: { jobDescription: acceptedDescription },
  });

  logAiEvent("ai_job_description_accepted", {
    userId: input.actor.userId,
    jobId: job.id,
    success: true,
  });

  return prisma.jobSpecificationVersion.findUniqueOrThrow({
    where: { id: draft.id },
  });
}

export async function discardGeneratedJobDescriptionForActor(input: {
  jobId: number;
  actor: JobDescriptionAiActor;
}) {
  const job = await loadScopedJob(input);
  const draft = await loadDraftOrThrow(job.id);

  const updated = await prisma.jobSpecificationVersion.updateMany({
    where: {
      id: draft.id,
      status: JobSpecificationVersionStatus.DRAFT,
    },
    data: {
      aiProposedJobDescription: null,
      aiGeneratedAt: null,
      aiGenerationStatus: JobDescriptionAiGenerationStatus.NONE,
    },
  });

  if (updated.count !== 1) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_NO_DRAFT_ERROR);
  }

  logAiEvent("ai_job_description_discarded", {
    userId: input.actor.userId,
    jobId: job.id,
    success: true,
  });

  return prisma.jobSpecificationVersion.findUniqueOrThrow({
    where: { id: draft.id },
  });
}
