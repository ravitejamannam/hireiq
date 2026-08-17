import {
  JOB_DESCRIPTION_AI_UNCHANGED_ERROR,
  JobDescriptionAiError,
  validateJobDescriptionAiOutput,
  type JobDescriptionAiOutput,
} from "@/lib/ai/job-description-output";
import {
  JOB_DESCRIPTION_PROMPT_VERSION,
  JOB_DESCRIPTION_SYSTEM_INSTRUCTIONS,
  buildJobDescriptionUserPayload,
  type JobDescriptionAiInput,
} from "@/lib/ai/job-description-prompt";

export type JobDescriptionGenerator = (
  input: JobDescriptionAiInput,
) => Promise<JobDescriptionAiOutput>;

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

async function generateWithOpenAi(
  input: JobDescriptionAiInput,
): Promise<JobDescriptionAiOutput> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
  }

  const model = getJobDescriptionAiModel();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: JOB_DESCRIPTION_SYSTEM_INSTRUCTIONS,
        },
        {
          role: "user",
          content: buildJobDescriptionUserPayload(input),
        },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
  }

  return validateJobDescriptionAiOutput(parsed);
}

/**
 * Production uses OpenAI when OPENAI_API_KEY is set.
 * Tests may inject a deterministic adapter. Live provider is never faked.
 */
export async function generateJobDescriptionFromProvider(
  input: JobDescriptionAiInput,
): Promise<JobDescriptionAiOutput> {
  if (generatorOverride) {
    return validateJobDescriptionAiOutput(await generatorOverride(input));
  }

  if (!isJobDescriptionAiProviderConfigured()) {
    throw new JobDescriptionAiError(JOB_DESCRIPTION_AI_UNCHANGED_ERROR);
  }

  return generateWithOpenAi(input);
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
