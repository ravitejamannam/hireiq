import type { GatewayResult } from "@/lib/ai/gateway";

export type AiRunRecord = {
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
  reviewerAction: "PENDING" | "REFUSED_OPT_OUT";
};

type AiRunWriter = {
  aIRun: {
    create: (args: { data: AiRunRecord }) => Promise<unknown>;
  };
};

export type AiRunScope = {
  companyId: number;
  entityType: string;
  entityId: number;
  db: AiRunWriter;
};

export function aiRunRecordFromGateway(input: {
  companyId: number;
  entityType: string;
  entityId: number;
  result: Pick<
    GatewayResult,
    "feature" | "model" | "promptVersion" | "inputHash" | "parsed" | "latencyMs" | "promptTokens" | "completionTokens"
  >;
}): AiRunRecord {
  return {
    companyId: input.companyId,
    feature: input.result.feature,
    entityType: input.entityType,
    entityId: input.entityId,
    modelId: input.result.model,
    promptVersion: input.result.promptVersion,
    inputHash: input.result.inputHash,
    outputJson: input.result.parsed,
    latencyMs: input.result.latencyMs,
    promptTokens: input.result.promptTokens,
    completionTokens: input.result.completionTokens,
    reviewerAction: "PENDING",
  };
}

/** Writes a row only when a company id and Prisma client are both present. */
export async function persistAiRun(scope: AiRunScope | null | undefined, result: GatewayResult | null) {
  if (!scope || !result) return null;
  const data = aiRunRecordFromGateway({
    companyId: scope.companyId,
    entityType: scope.entityType,
    entityId: scope.entityId,
    result,
  });
  await scope.db.aIRun.create({ data });
  return data;
}

/** Records that a candidate-evaluation model call was refused. Does not store a judgement. */
export async function persistRefusedOptOut(
  scope: AiRunScope | null | undefined,
  input: {
    feature: string;
    modelId: string;
    promptVersion: string;
    inputHash: string;
  },
) {
  if (!scope) return null;
  const data: AiRunRecord = {
    companyId: scope.companyId,
    feature: input.feature,
    entityType: scope.entityType,
    entityId: scope.entityId,
    modelId: input.modelId,
    promptVersion: input.promptVersion,
    inputHash: input.inputHash,
    outputJson: { refused: true, status: "REFUSED_OPT_OUT" },
    latencyMs: 0,
    promptTokens: null,
    completionTokens: null,
    reviewerAction: "REFUSED_OPT_OUT",
  };
  await scope.db.aIRun.create({ data });
  return data;
}
