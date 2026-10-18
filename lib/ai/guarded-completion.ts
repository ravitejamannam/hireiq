import type { AiRunScope } from "@/lib/ai/ai-run";
import {
  completeStructured,
  isCandidateEvaluationFeature,
  type GatewayRequest,
  type GatewayResult,
} from "@/lib/ai/gateway";
import { withAIRun } from "@/lib/ai/run";

export type GuardedCompletion =
  | { status: "COMPLETED"; result: GatewayResult }
  | { status: "REFUSED_OPT_OUT"; result: null };

/**
 * Candidate-evaluation features skip the model when the application opted out.
 * That refusal does not write an AIRun. Job-description features still run.
 */
export async function runGuardedCompletion(input: {
  optedOut: boolean;
  scope?: AiRunScope | null;
  request: GatewayRequest;
  complete?: (request: GatewayRequest) => Promise<GatewayResult>;
  actorUserId?: number | null;
}): Promise<GuardedCompletion> {
  if (input.optedOut && isCandidateEvaluationFeature(input.request.feature)) {
    return { status: "REFUSED_OPT_OUT", result: null };
  }

  const subject = input.scope
    ? {
        companyId: input.scope.companyId,
        entityType: input.scope.entityType,
        entityId: input.scope.entityId,
        model: input.request.model,
        promptVersion: input.request.promptVersion,
        input: { system: input.request.system, user: input.request.user },
        db: input.scope.db as never,
      }
    : null;
  const result = await withAIRun(
    input.request.feature,
    input.actorUserId === undefined ? null : { userId: input.actorUserId },
    subject,
    async () => {
      const value = await (input.complete ?? completeStructured)(input.request);
      return {
        value,
        promptTokens: value.promptTokens,
        completionTokens: value.completionTokens,
        output: value.parsed,
      };
    },
  );
  return { status: "COMPLETED", result };
}
