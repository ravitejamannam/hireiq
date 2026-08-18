import {
  CandidateIntelligenceError,
  INTELLIGENCE_AI_INVALID_OUTPUT,
  INTELLIGENCE_AI_NOT_CONFIGURED,
  INTELLIGENCE_AI_PROVIDER_ERROR,
  INTELLIGENCE_AI_TIMEOUT,
  INTELLIGENCE_UNCHANGED_ERROR,
} from "@/lib/candidates/intelligence/intelligence-errors";
import {
  CANDIDATE_INTELLIGENCE_PROMPT_VERSION,
  CANDIDATE_INTELLIGENCE_SYSTEM_INSTRUCTIONS,
  buildCandidateIntelligenceUserPayload,
} from "@/lib/candidates/intelligence/intelligence-prompt";
import { validateCandidateIntelligenceAiOutput } from "@/lib/candidates/intelligence/intelligence-validation";
import type { ExtractedClaimDraft } from "@/lib/candidates/intelligence/intelligence-types";

export type CandidateIntelligenceGenerator = (
  evidenceText: string,
) => Promise<unknown>;

let generatorOverride: CandidateIntelligenceGenerator | null = null;

export function setCandidateIntelligenceGeneratorForTests(
  generator: CandidateIntelligenceGenerator | null,
) {
  generatorOverride = generator;
}

function getOpenAiApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key ? key : null;
}

export function getCandidateIntelligenceAiModel() {
  return (
    process.env.OPENAI_CANDIDATE_INTELLIGENCE_MODEL?.trim() || "gpt-4o-mini"
  );
}

export function isCandidateIntelligenceAiConfigured() {
  return Boolean(getOpenAiApiKey());
}

export function getCandidateIntelligenceAiProviderLabel() {
  if (generatorOverride) {
    return "test-adapter";
  }
  if (isCandidateIntelligenceAiConfigured()) {
    return "openai";
  }
  return "unconfigured";
}

function isTimeoutError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

function toProviderError(error: unknown): never {
  if (error instanceof CandidateIntelligenceError) {
    throw error;
  }
  if (isTimeoutError(error)) {
    throw new CandidateIntelligenceError(
      INTELLIGENCE_UNCHANGED_ERROR,
      INTELLIGENCE_AI_TIMEOUT,
    );
  }
  throw new CandidateIntelligenceError(
    INTELLIGENCE_UNCHANGED_ERROR,
    INTELLIGENCE_AI_PROVIDER_ERROR,
  );
}

async function generateWithOpenAi(evidenceText: string): Promise<unknown> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new CandidateIntelligenceError(
      INTELLIGENCE_UNCHANGED_ERROR,
      INTELLIGENCE_AI_NOT_CONFIGURED,
    );
  }

  const model = getCandidateIntelligenceAiModel();
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0,
        messages: [
          {
            role: "system",
            content: CANDIDATE_INTELLIGENCE_SYSTEM_INSTRUCTIONS,
          },
          {
            role: "user",
            content: buildCandidateIntelligenceUserPayload(evidenceText),
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    return toProviderError(error);
  }

  if (!response.ok) {
    throw new CandidateIntelligenceError(
      INTELLIGENCE_UNCHANGED_ERROR,
      INTELLIGENCE_AI_PROVIDER_ERROR,
    );
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw new CandidateIntelligenceError(
      INTELLIGENCE_UNCHANGED_ERROR,
      INTELLIGENCE_AI_INVALID_OUTPUT,
    );
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new CandidateIntelligenceError(
      INTELLIGENCE_UNCHANGED_ERROR,
      INTELLIGENCE_AI_INVALID_OUTPUT,
    );
  }
}

export async function extractClaimsFromEvidenceText(
  evidenceText: string,
): Promise<ExtractedClaimDraft[]> {
  let raw: unknown;
  try {
    if (generatorOverride) {
      raw = await generatorOverride(evidenceText);
    } else if (!isCandidateIntelligenceAiConfigured()) {
      throw new CandidateIntelligenceError(
        INTELLIGENCE_UNCHANGED_ERROR,
        INTELLIGENCE_AI_NOT_CONFIGURED,
      );
    } else {
      raw = await generateWithOpenAi(evidenceText);
    }
  } catch (error) {
    return toProviderError(error);
  }

  return validateCandidateIntelligenceAiOutput(raw, evidenceText);
}

export { CANDIDATE_INTELLIGENCE_PROMPT_VERSION };
