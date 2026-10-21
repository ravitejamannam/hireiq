import type { AiRunScope } from "@/lib/ai/ai-run";
import type { GatewaySubject } from "@/lib/ai/gateway";
import { runGuardedCompletion } from "@/lib/ai/guarded-completion";
import {
  CandidateIntelligenceError,
  INTELLIGENCE_AI_NOT_CONFIGURED,
  INTELLIGENCE_AI_OPT_OUT,
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

const CLAIMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["claims"],
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claimType", "value"],
        properties: {
          claimType: { type: "string", enum: ["SKILL", "EMPLOYER", "JOB_TITLE", "LOCATION"] },
          value: { type: "string" },
        },
      },
    },
  },
} as const;

async function generateWithOpenAi(
  evidenceText: string,
  scope: AiRunScope | null,
  subject?: GatewaySubject,
): Promise<unknown> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new CandidateIntelligenceError(
      INTELLIGENCE_UNCHANGED_ERROR,
      INTELLIGENCE_AI_NOT_CONFIGURED,
    );
  }

  const model = getCandidateIntelligenceAiModel();
  try {
    const outcome = await runGuardedCompletion({
      optedOut: false,
      scope,
      request: {
        subject,
        feature: "evidence_review",
        model,
        promptVersion: CANDIDATE_INTELLIGENCE_PROMPT_VERSION,
        system: CANDIDATE_INTELLIGENCE_SYSTEM_INSTRUCTIONS,
        user: buildCandidateIntelligenceUserPayload(evidenceText),
        schemaName: "candidate_claims",
        schema: CLAIMS_SCHEMA,
        timeoutMs: 20_000,
        maxRetries: 0,
        apiKey,
      },
    });
    return outcome.result?.parsed;
  } catch (error) {
    return toProviderError(error);
  }
}

export async function extractClaimsFromEvidenceText(
  evidenceText: string,
  guard?: { optedOut: boolean; scope: AiRunScope | null; subject?: GatewaySubject },
): Promise<ExtractedClaimDraft[]> {
  if (guard?.optedOut) {
    throw new CandidateIntelligenceError(
      "Candidate opted out of AI evaluation.",
      INTELLIGENCE_AI_OPT_OUT,
    );
  }

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
      raw = await generateWithOpenAi(evidenceText, guard?.scope ?? null, guard?.subject);
    }
  } catch (error) {
    return toProviderError(error);
  }

  return validateCandidateIntelligenceAiOutput(raw, evidenceText);
}

export { CANDIDATE_INTELLIGENCE_PROMPT_VERSION };
