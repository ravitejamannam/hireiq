import { describe, expect, it, vi } from "vitest";

import { runGuardedCompletion } from "@/lib/ai/guarded-completion";
import type { GatewayRequest, GatewayResult } from "@/lib/ai/gateway";

const request: GatewayRequest = {
  feature: "evidence_review",
  model: "gpt-4o-mini",
  promptVersion: "claims-1",
  system: "extract",
  user: "resume text",
  schemaName: "candidate_claims",
  schema: { type: "object" },
};

function result(): GatewayResult {
  return {
    parsed: { claims: [] },
    raw: "{}",
    latencyMs: 9,
    promptTokens: 2,
    completionTokens: 1,
    inputHash: "hash",
    model: request.model,
    promptVersion: request.promptVersion,
    feature: request.feature,
  };
}

describe("runGuardedCompletion", () => {
  it("does not invoke the model when the application opted out", async () => {
    const created: unknown[] = [];
    const complete = vi.fn(async () => result());
    const outcome = await runGuardedCompletion({
      optedOut: true,
      request,
      complete,
      scope: {
        companyId: 3,
        entityType: "Application",
        entityId: 11,
        db: {
          aIRun: {
            create: async ({ data }) => {
              created.push(data);
              return data;
            },
          },
        },
      },
    });
    expect(complete).not.toHaveBeenCalled();
    expect(outcome.status).toBe("REFUSED_OPT_OUT");
    expect(created).toHaveLength(0);
  });

  it("records an AIRun when evaluation is allowed", async () => {
    const created: unknown[] = [];
    const complete = vi.fn(async () => result());
    const outcome = await runGuardedCompletion({
      optedOut: false,
      request,
      complete,
      scope: {
        companyId: 3,
        entityType: "Application",
        entityId: 11,
        db: {
          aIRun: {
            create: async ({ data }) => {
              created.push(data);
              return data;
            },
          },
        },
      },
    });
    expect(complete).toHaveBeenCalledOnce();
    expect(outcome.status).toBe("COMPLETED");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      reviewerAction: "PENDING",
      outputJson: { claims: [] },
      modelId: "gpt-4o-mini",
    });
  });

  it("still calls the model for job descriptions when a candidate opted out", async () => {
    const complete = vi.fn(async () => ({ ...result(), feature: "job_description" as const }));
    const outcome = await runGuardedCompletion({
      optedOut: true,
      complete,
      request: { ...request, feature: "job_description" },
    });
    expect(complete).toHaveBeenCalledOnce();
    expect(outcome.status).toBe("COMPLETED");
  });
});
