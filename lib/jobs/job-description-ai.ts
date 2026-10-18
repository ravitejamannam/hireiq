import {
  JobDescriptionAiGenerationStatus,
  JobSpecificationVersionStatus,
  Prisma,
} from "@prisma/client";

import {
  JD_SECTIONS,
  acceptedJobDescriptionText,
  mergeJobDescriptionSection,
  packProposal,
  parseJobDescriptionControls,
  parseStoredProposal,
  type JdControls,
  type JdSection,
} from "@/lib/ai/job-description-document";
import {
  generateJobDescriptionFromProvider,
  getJobDescriptionAiModel,
  getJobDescriptionAiProviderLabel,
  regenerateJobDescriptionSectionFromProvider,
} from "@/lib/ai/job-description-generator";
import type { AiRunScope } from "@/lib/ai/ai-run";
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

async function ensureDraftForGeneration(jobId: number) {
  const existing = await prisma.jobSpecificationVersion.findFirst({
    where: { jobId, status: JobSpecificationVersionStatus.DRAFT },
  });
  if (existing) return existing;

  const published = await prisma.jobSpecificationVersion.findFirst({
    where: { jobId, status: JobSpecificationVersionStatus.PUBLISHED },
    orderBy: { versionNumber: "desc" },
  });
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const source = published ?? job;
  const latest = await prisma.jobSpecificationVersion.findFirst({
    where: { jobId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });

  return prisma.jobSpecificationVersion.create({
    data: {
      jobId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      status: JobSpecificationVersionStatus.DRAFT,
      createdByUserId: null,
      structuredPayload:
        published?.structuredPayload ??
        ({ schemaVersion: 1, legacy: true } as Prisma.InputJsonValue),
      ...specFieldsFromRecord(source),
    },
  });
}

export async function generateJobDescriptionForActor(input: {
  jobId: number;
  actor: JobDescriptionAiActor;
  controls?: unknown;
}) {
  const job = await loadScopedJob(input);
  const draft = await ensureDraftForGeneration(job.id);
  const controls = parseJobDescriptionControls(input.controls);

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
    const company = await prisma.company.findUnique({
      where: { id: job.companyId },
      select: { name: true, industry: true },
    });
    const proposal = await generateJobDescriptionFromProvider(
      buildJobDescriptionAiInput({
        ...specFieldsFromRecord(draft),
        structuredPayload: {
          ...(draft.structuredPayload && typeof draft.structuredPayload === "object"
            ? (draft.structuredPayload as object)
            : {}),
          companyName: company?.name ?? null,
          companyIndustry: company?.industry ?? null,
        },
      }),
      controls,
      {
        companyId: job.companyId,
        entityType: "JobSpecificationVersion",
        entityId: draft.id,
        db: prisma as unknown as AiRunScope["db"],
      },
    );
    logAiEvent("ai_job_description_completed", {
      userId: input.actor.userId,
      jobId: job.id,
      provider,
      model,
      durationMs: proposal.usage.latencyMs,
      promptTokens: proposal.usage.promptTokens,
      completionTokens: proposal.usage.completionTokens,
      cacheHit: proposal.usage.cacheHit,
      success: true,
    });

    const stored = await prisma.jobSpecificationVersion.updateMany({
      where: {
        id: draft.id,
        status: JobSpecificationVersionStatus.DRAFT,
        aiGenerationStatus: JobDescriptionAiGenerationStatus.GENERATING,
      },
      data: {
        aiProposedJobDescription: proposal.proposalJson ?? proposal.jobDescription,
        aiGeneratedAt: new Date(),
        aiGenerationStatus: JobDescriptionAiGenerationStatus.READY,
      },
    });

    if (stored.count !== 1) {
      throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
    }

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

  const acceptedDescription = acceptedJobDescriptionText(draft.aiProposedJobDescription);
  const proposal = parseStoredProposal(draft.aiProposedJobDescription);
  const existingPayload =
    draft.structuredPayload &&
    typeof draft.structuredPayload === "object" &&
    !Array.isArray(draft.structuredPayload)
      ? (draft.structuredPayload as Record<string, unknown>)
      : {};
  const structuredPayload = proposal
    ? ({
        ...existingPayload,
        jdMatcher: {
          screeningQuestions: proposal.document.screeningQuestions,
          scoringRubric: proposal.document.scoringRubric,
        },
      } as Prisma.InputJsonValue)
    : undefined;

  const updated = await prisma.jobSpecificationVersion.updateMany({
    where: {
      id: draft.id,
      status: JobSpecificationVersionStatus.DRAFT,
      aiGenerationStatus: JobDescriptionAiGenerationStatus.READY,
    },
    data: {
      jobDescription: acceptedDescription,
      ...(structuredPayload ? { structuredPayload } : {}),
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

function sectionValue(section: JdSection, text: string) {
  if (section === "summary" || section === "hiringProcess") return text;
  const lines = text
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  if (section === "scoringRubric") {
    return lines.map((line) => {
      const [criterion, signal] = line.split(":");
      return { criterion: criterion.trim(), signal: (signal ?? criterion).trim() };
    });
  }
  return lines;
}

export async function regenerateJobDescriptionSectionForActor(input: {
  jobId: number;
  actor: JobDescriptionAiActor;
  section: string;
  instruction: string;
  controls?: unknown;
}) {
  if (!JD_SECTIONS.includes(input.section as JdSection)) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
  }
  const section = input.section as JdSection;
  const job = await loadScopedJob(input);
  const draft = await loadDraftOrThrow(job.id);
  const stored = parseStoredProposal(draft.aiProposedJobDescription);
  if (!stored) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_NO_PROPOSAL_ERROR);
  }

  const controls: JdControls = parseJobDescriptionControls(input.controls ?? stored.controls);
  const text = await regenerateJobDescriptionSectionFromProvider({
    spec: buildJobDescriptionAiInput({
      ...specFieldsFromRecord(draft),
      structuredPayload: draft.structuredPayload,
    }),
    controls,
    section,
    instruction: input.instruction,
    current: stored.document,
    scope: {
      companyId: job.companyId,
      entityType: "JobSpecificationVersion",
      entityId: draft.id,
      db: prisma as unknown as AiRunScope["db"],
    },
  });
  const document = mergeJobDescriptionSection(stored.document, section, sectionValue(section, text));
  const packed = packProposal({
    document,
    source: {
      title: draft.title,
      experienceRange: draft.experienceRange,
      location: draft.location,
      compensationRange: draft.compensationRange,
      mustHaveRequirements: draft.mustHaveRequirements,
      niceToHaveRequirements: draft.niceToHaveRequirements,
      primarySkills: draft.primarySkills,
      jobDescription: draft.jobDescription,
    },
    controls,
  });

  await prisma.jobSpecificationVersion.update({
    where: { id: draft.id },
    data: { aiProposedJobDescription: JSON.stringify(packed) },
  });

  return packed;
}
