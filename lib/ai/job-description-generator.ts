import {
  DEFAULT_JD_CONTROLS,
  JOB_DESCRIPTION_JSON_SCHEMA,
  hashJobDescriptionRequest,
  jobDescriptionDocumentSchema,
  packProposal,
  type GroundingSource,
  type JdControls,
  type JdSection,
  type JobDescriptionDocument,
} from "@/lib/ai/job-description-document";
import {
  JOB_DESCRIPTION_AI_UNCHANGED_ERROR,
  JobDescriptionAiError,
  validateJobDescriptionAiOutput,
  type JobDescriptionAiOutput,
} from "@/lib/ai/job-description-output";
import type { AiRunScope } from "@/lib/ai/ai-run";
import { completeStructured, type GatewayResult } from "@/lib/ai/gateway";
import { withAIRun } from "@/lib/ai/run";
import { getPrompt } from "@/lib/ai/prompt-registry";
import {
  JOB_DESCRIPTION_PROMPT_VERSION,
  JOB_DESCRIPTION_SYSTEM_INSTRUCTIONS,
  buildJobDescriptionUserPayload,
  type JobDescriptionAiInput,
} from "@/lib/ai/job-description-prompt";

export type JobDescriptionGenerator = (
  input: JobDescriptionAiInput,
) => Promise<JobDescriptionAiOutput>;

const responseCache = new Map<string, string>();

export type GeneratedJobDescription = {
  jobDescription: string;
  proposalJson: string | null;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    latencyMs: number;
    cacheHit: boolean;
  };
};

let generatorOverride: JobDescriptionGenerator | null = null;

export function setJobDescriptionGeneratorForTests(
  generator: JobDescriptionGenerator | null,
) {
  generatorOverride = generator;
}

export function getOpenAiApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key ? key : null;
}

export function getJobDescriptionAiModel() {
  return process.env.OPENAI_JOB_DESCRIPTION_MODEL?.trim() || "gpt-4o-mini";
}

export function isJobDescriptionAiProviderConfigured() {
  return Boolean(getOpenAiApiKey());
}

function groundingFromInput(input: JobDescriptionAiInput): GroundingSource {
  const payload = input.structuredPayload as { companyName?: string; companyIndustry?: string } | null;
  return {
    title: input.title,
    experienceRange: input.experienceRange,
    location: input.location,
    compensationRange: input.compensationRange,
    mustHaveRequirements: input.mustHaveRequirements,
    niceToHaveRequirements: input.niceToHaveRequirements,
    primarySkills: input.primarySkills,
    jobDescription: input.jobDescription,
    companyName: payload?.companyName ?? null,
    companyIndustry: payload?.companyIndustry ?? null,
  };
}

async function completeJsonSchema(input: {
  userPayload: string;
  schemaName: string;
  schema: unknown;
  scope?: AiRunScope | null;
}): Promise<{ parsed: unknown; usage: GeneratedJobDescription["usage"]; result: GatewayResult }> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
  }

  const prompt = getPrompt("job_description");
  const feature = input.schemaName === "job_description_section" ? "job_description_section" : "job_description";
  let completed;
  try {
    completed = await withAIRun(
      feature,
      null,
      input.scope
        ? {
            companyId: input.scope.companyId,
            entityType: input.scope.entityType,
            entityId: input.scope.entityId,
            model: getJobDescriptionAiModel(),
            promptVersion: prompt.version,
            input: { system: JOB_DESCRIPTION_SYSTEM_INSTRUCTIONS, user: input.userPayload },
            db: input.scope.db as never,
          }
        : null,
      async () => {
        const value = await completeStructured({
          feature,
          model: getJobDescriptionAiModel(),
          promptVersion: prompt.version,
          system: JOB_DESCRIPTION_SYSTEM_INSTRUCTIONS,
          user: input.userPayload,
          schemaName: input.schemaName,
          schema: input.schema,
          timeoutMs: prompt.timeoutMs,
          maxRetries: prompt.maxRetries,
          apiKey,
        });
        return {
          value,
          promptTokens: value.promptTokens,
          completionTokens: value.completionTokens,
          output: value.parsed,
        };
      },
    );
  } catch {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
  }
  return {
    parsed: completed.parsed,
    result: completed,
    usage: {
      promptTokens: completed.promptTokens,
      completionTokens: completed.completionTokens,
      latencyMs: completed.latencyMs,
      cacheHit: false,
    },
  };
}

function emptyUsage(latencyMs: number, cacheHit: boolean): GeneratedJobDescription["usage"] {
  return { promptTokens: null, completionTokens: null, latencyMs, cacheHit };
}

/**
 * Production uses OpenAI when OPENAI_API_KEY is set.
 * Tests may inject a deterministic adapter. Live provider is never faked.
 */
export function jobDescriptionCacheKey(
  input: JobDescriptionAiInput,
  controls: JdControls = DEFAULT_JD_CONTROLS,
) {
  return hashJobDescriptionRequest({
    promptVersion: JOB_DESCRIPTION_PROMPT_VERSION,
    model: getJobDescriptionAiModel(),
    tone: controls.tone,
    length: controls.length,
    india: controls.india,
    input,
  });
}

export async function generateJobDescriptionFromProvider(
  input: JobDescriptionAiInput,
  controls: JdControls = DEFAULT_JD_CONTROLS,
  scope?: AiRunScope | null,
): Promise<GeneratedJobDescription> {
  if (generatorOverride) {
    const started = Date.now();
    const output = validateJobDescriptionAiOutput(await generatorOverride(input));
    return {
      jobDescription: output.jobDescription,
      proposalJson: null,
      usage: emptyUsage(Date.now() - started, false),
    };
  }

  if (!isJobDescriptionAiProviderConfigured()) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
  }

  const cacheKey = jobDescriptionCacheKey(input, controls);
  const cached = responseCache.get(cacheKey);
  if (cached) {
    return {
      jobDescription: cached,
      proposalJson: cached,
      usage: emptyUsage(0, true),
    };
  }

  const completed = await completeJsonSchema({
    userPayload: buildJobDescriptionUserPayload(input, controls),
    schemaName: JOB_DESCRIPTION_JSON_SCHEMA.name,
    schema: JOB_DESCRIPTION_JSON_SCHEMA.schema,
    scope,
  });
  const document = jobDescriptionDocumentSchema.parse(completed.parsed);
  const packed = JSON.stringify(
    packProposal({ document, source: groundingFromInput(input), controls }),
  );
  responseCache.set(cacheKey, packed);
  console.log("[ai] ai_job_description_usage", {
    model: getJobDescriptionAiModel(),
    ...completed.usage,
    cacheHit: false,
  });
  return {
    jobDescription: packed,
    proposalJson: packed,
    usage: completed.usage,
  };
}

export async function regenerateJobDescriptionSectionFromProvider(input: {
  spec: JobDescriptionAiInput;
  controls: JdControls;
  section: JdSection;
  instruction: string;
  current: JobDescriptionDocument;
  scope?: AiRunScope | null;
}): Promise<string> {
  const completed = await completeJsonSchema({
    userPayload:
      buildJobDescriptionUserPayload(input.spec, input.controls, {
        key: input.section,
        instruction: input.instruction,
      }) + `\nCurrent document:\n${JSON.stringify(input.current)}\nReturn only the rewritten section text.`,
    schemaName: "job_description_section",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    scope: input.scope,
  });
  const record = completed.parsed as { text?: unknown };
  if (typeof record.text !== "string" || !record.text.trim()) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
  }
  console.log("[ai] ai_job_description_section_usage", {
    section: input.section,
    ...completed.usage,
  });
  return record.text.trim();
}

export function getJobDescriptionAiProviderLabel() {
  if (generatorOverride) {
    return "test-adapter";
  }

  if (isJobDescriptionAiProviderConfigured()) {
    return "openai";
  }

  return "unconfigured";
}

export { JOB_DESCRIPTION_PROMPT_VERSION };
