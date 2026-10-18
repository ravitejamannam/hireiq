import { describe, expect, it } from "vitest";

import { aiRunRecordFromGateway, persistAiRun } from "@/lib/ai/ai-run";
import { parseKnockoutAnswers } from "@/lib/apply/knockout";

describe("persistAiRun", () => {
  it("writes the gateway fields when a company client is present", async () => {
    const created: unknown[] = [];
    const result = {
      feature: "job_description" as const,
      model: "gpt-4o-mini",
      promptVersion: "jd-mvp-1",
      inputHash: "abc",
      parsed: { summary: "Draft" },
      raw: "{}",
      latencyMs: 12,
      promptTokens: 3,
      completionTokens: 4,
    };
    const written = await persistAiRun(
      {
        companyId: 8,
        entityType: "JobSpecificationVersion",
        entityId: 15,
        db: {
          aIRun: {
            create: async ({ data }) => {
              created.push(data);
              return data;
            },
          },
        },
      },
      result,
    );
    expect(written).toEqual(aiRunRecordFromGateway({
      companyId: 8,
      entityType: "JobSpecificationVersion",
      entityId: 15,
      result,
    }));
    expect(created).toHaveLength(1);
    expect(await persistAiRun(null, result)).toBeNull();
  });
});

describe("parseKnockoutAnswers", () => {
  it("keeps integer question ids", () => {
    expect(parseKnockoutAnswers({
      knockoutAnswers: [{ questionId: 2, answer: "yes" }, { questionId: "3", answer: "no" }],
    })).toEqual([{ questionId: 2, answer: "yes" }]);
  });
});
