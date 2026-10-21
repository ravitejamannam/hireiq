import { createHash } from "node:crypto";
import { aiBlockReasonForSubject, type AiSubject } from "@/lib/ai/ai-policy";
import { AiEvaluationOptOutError } from "@/lib/ai/opt-out";

export type GatewayFeature =
  | "job_description"
  | "job_description_section"
  | "requirement_extraction"
  | "requirement_quotes"
  | "interview_question"
  | "evidence_review"
  | "resume_fields"
  | "notes_draft"
  | "rejection_email"
  | "resume_vision"
  | "embeddings"
  | "assessment_grade";

export type GatewayRequest = {
  feature: GatewayFeature;
  model: string;
  promptVersion: string;
  system: string;
  user: string;
  schemaName: string;
  schema: unknown;
  timeoutMs?: number;
  maxRetries?: number;
  apiKey?: string | null;
  /**
   * Whose data this request is about. Required for candidate-evaluation features and re-checked against the
   * database on every call (preference, human review, tenant). `synthetic` is for fixtures and is refused in production.
   */
  subject?: GatewaySubject;
};

export type GatewaySubject = AiSubject | { synthetic: true };

export type GatewayResult = {
  parsed: unknown;
  raw: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  inputHash: string;
  model: string;
  promptVersion: string;
  feature: GatewayFeature;
};

const EVALUATION_FEATURES = new Set<GatewayFeature>([
  "evidence_review",
  "resume_fields",
  "requirement_quotes",
  "notes_draft",
  "resume_vision",
  "assessment_grade",
]);

export function isCandidateEvaluationFeature(feature: GatewayFeature) {
  return EVALUATION_FEATURES.has(feature);
}

export function hashGatewayInput(input: Pick<GatewayRequest, "feature" | "model" | "promptVersion" | "system" | "user">) {
  return createHash("sha256")
    .update(JSON.stringify({
      feature: input.feature,
      model: input.model,
      promptVersion: input.promptVersion,
      system: input.system,
      user: input.user,
    }))
    .digest("hex");
}

export function assertEvaluationAllowed(input: {
  feature: GatewayFeature;
  optedOut: boolean;
}) {
  if (input.optedOut && EVALUATION_FEATURES.has(input.feature)) {
    throw new Error("Candidate opted out of AI evaluation.");
  }
}

type FetchImpl = typeof fetch;

let fetchOverride: FetchImpl | null = null;

export function setGatewayFetchForTests(fetchImpl: FetchImpl | null) {
  fetchOverride = fetchImpl;
}

/** The only place that talks to api.openai.com. */
export function postOpenAi(input: {
  path: "/v1/chat/completions" | "/v1/embeddings";
  apiKey: string;
  body: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}) {
  return (fetchOverride ?? fetch)(`https://api.openai.com${input.path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.body),
    signal: input.signal ?? AbortSignal.timeout(input.timeoutMs ?? 20_000),
  });
}

/**
 * Returns an in-memory run payload. Persistence is persistAiRun in lib/ai/ai-run.ts.
 * Offline calls with no company id keep this payload and do not insert AIRun.
 */
export async function assertGatewaySubject(feature: GatewayFeature, subject: GatewaySubject | undefined) {
  if (!EVALUATION_FEATURES.has(feature)) return;
  if (subject && "synthetic" in subject) {
    if (process.env.NODE_ENV === "production") throw new AiEvaluationOptOutError("NO_APPLICATION");
    return;
  }
  const reason = await aiBlockReasonForSubject(subject ?? {});
  if (reason) throw new AiEvaluationOptOutError(reason);
}

export async function completeStructured(input: GatewayRequest): Promise<GatewayResult> {
  await assertGatewaySubject(input.feature, input.subject);
  const apiKey = input.apiKey ?? process.env.OPENAI_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error("AI provider is not configured.");
  }
  const timeoutMs = input.timeoutMs ?? 20_000;
  const maxRetries = input.maxRetries ?? 1;
  const inputHash = hashGatewayInput(input);
  const started = Date.now();
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await postOpenAi({
        path: "/v1/chat/completions",
        apiKey,
        timeoutMs,
        body: {
          model: input.model,
          temperature: 0.2,
          response_format: {
            type: "json_schema",
            json_schema: { name: input.schemaName, strict: true, schema: input.schema },
          },
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
        },
      });
      if (!response.ok) {
        throw new Error(`AI provider status ${response.status}`);
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const raw = body.choices?.[0]?.message?.content;
      if (!raw) throw new Error("AI provider returned empty content.");
      return {
        parsed: JSON.parse(raw) as unknown,
        raw,
        latencyMs: Date.now() - started,
        promptTokens: body.usage?.prompt_tokens ?? null,
        completionTokens: body.usage?.completion_tokens ?? null,
        inputHash,
        model: input.model,
        promptVersion: input.promptVersion,
        feature: input.feature,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI provider failed.");
}
