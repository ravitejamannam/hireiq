import { createHash } from "node:crypto";

import { createAiRunUnlessErased } from "@/lib/privacy/erasure-guard";
import { prisma } from "@/lib/prisma";

/** Model features that must write exactly one AIRun per call. */
export const MODEL_FEATURES = [
  "job_description",
  "job_description_section",
  "resume_fields",
  "resume_vision",
  "requirement_quotes",
  "embeddings",
  "assessment_grade",
  "evidence_review",
  "talent_rediscovery",
  "copilot",
  "interview_notes",
  "assessment_assistant",
  "outreach_draft",
] as const;

export type ModelFeature = (typeof MODEL_FEATURES)[number];

export type AiRunActor = { userId: number | null } | null;

export type AiRunCallSubject = {
  companyId: number;
  entityType: string;
  entityId: number;
  model: string;
  promptVersion: string;
  input: unknown;
  db?: {
    aIRun: {
      create: (args: { data: AiRunRow }) => Promise<unknown>;
    };
  };
};

type AiRunRow = {
  companyId: number;
  feature: string;
  entityType: string;
  entityId: number;
  modelId: string;
  promptVersion: string;
  inputHash: string;
  outputJson: unknown;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  status: string;
  error: string | null;
  reviewerAction: "PENDING";
};

function hashInput(feature: string, input: unknown) {
  return createHash("sha256").update(JSON.stringify({ feature, input })).digest("hex");
}

async function insertRun(subject: AiRunCallSubject, data: AiRunRow) {
  // Goes through the erasure guard when this is the real client and the entity belongs to a candidate.
  await createAiRunUnlessErased(subject.db ?? prisma, data);
}

/**
 * Runs one model call and writes one AIRun.
 * A missing subject still runs the call and writes nothing (offline tests).
 * Errors are stored, then rethrown. Opt-out must return before this is called.
 */
export async function withAIRun<T>(
  feature: string,
  actor: AiRunActor,
  subject: AiRunCallSubject | null,
  fn: () => Promise<{
    value: T;
    promptTokens?: number | null;
    completionTokens?: number | null;
    output?: unknown;
  }>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    if (subject) {
      const output =
        result.output && typeof result.output === "object"
          ? { ...(result.output as Record<string, unknown>), actorUserId: actor?.userId ?? null }
          : { output: result.output ?? null, actorUserId: actor?.userId ?? null };
      await insertRun(subject, {
        companyId: subject.companyId,
        feature,
        entityType: subject.entityType,
        entityId: subject.entityId,
        modelId: subject.model,
        promptVersion: subject.promptVersion,
        inputHash: hashInput(feature, subject.input),
        outputJson: output,
        latencyMs: Date.now() - started,
        promptTokens: result.promptTokens ?? null,
        completionTokens: result.completionTokens ?? null,
        status: "ok",
        error: null,
        reviewerAction: "PENDING",
      });
    }
    return result.value;
  } catch (error) {
    if (subject) {
      const message = error instanceof Error ? error.message : "Model call failed.";
      await insertRun(subject, {
        companyId: subject.companyId,
        feature,
        entityType: subject.entityType,
        entityId: subject.entityId,
        modelId: subject.model,
        promptVersion: subject.promptVersion,
        inputHash: hashInput(feature, subject.input),
        outputJson: { actorUserId: actor?.userId ?? null },
        latencyMs: Date.now() - started,
        promptTokens: null,
        completionTokens: null,
        status: "error",
        error: message,
        reviewerAction: "PENDING",
      }).catch(() => undefined);
    }
    throw error;
  }
}
