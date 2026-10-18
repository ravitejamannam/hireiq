import { describe, expect, it } from "vitest";

import { MODEL_FEATURES, withAIRun } from "@/lib/ai/run";

describe("withAIRun", () => {
  it("writes exactly one AIRun for each model feature", async () => {
    for (const feature of MODEL_FEATURES) {
      const created: unknown[] = [];
      const value = await withAIRun(
        feature,
        { userId: 7 },
        {
          companyId: 1,
          entityType: "Application",
          entityId: 2,
          model: "gpt-4o-mini",
          promptVersion: "v1",
          input: { feature },
          db: {
            aIRun: {
              create: async ({ data }) => {
                created.push(data);
                return data;
              },
            },
          },
        },
        async () => ({
          value: "ok",
          promptTokens: 3,
          completionTokens: 1,
          output: { feature },
        }),
      );
      expect(value).toBe("ok");
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        feature,
        modelId: "gpt-4o-mini",
        promptVersion: "v1",
        promptTokens: 3,
        completionTokens: 1,
        status: "ok",
        error: null,
        reviewerAction: "PENDING",
      });
    }
  });

  it("records the error and still throws", async () => {
    const created: Array<{ status: string; error: string | null }> = [];
    await expect(
      withAIRun(
        "requirement_quotes",
        null,
        {
          companyId: 1,
          entityType: "Application",
          entityId: 2,
          model: "gpt-4o-mini",
          promptVersion: "v1",
          input: {},
          db: {
            aIRun: {
              create: async ({ data }) => {
                created.push(data as { status: string; error: string | null });
                return data;
              },
            },
          },
        },
        async () => {
          throw new Error("provider down");
        },
      ),
    ).rejects.toThrow("provider down");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ status: "error", error: "provider down" });
  });
});
