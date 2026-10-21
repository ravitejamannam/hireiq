import { afterEach, describe, expect, it, vi } from "vitest";

import { transcribeResumePage } from "@/lib/resumes/layout-vision";

const image = new Uint8Array([1, 2, 3, 4]);

function audit(optedOut: boolean) {
  const created: unknown[] = [];
  return {
    created,
    scope: {
      companyId: 9,
      entityType: "Application",
      entityId: 44,
      applicationId: 44,
      pageCount: 2,
      pageIndex: 0,
      db: {
        application: {
          findUnique: async () => ({ id: 44, candidateId: 1, companyId: 9, aiPreference: optedOut ? ("REFUSED" as const) : ("ALLOWED" as const), humanReviewRequestedAt: null }),
        },
        aIRun: {
          create: async ({ data }: { data: unknown }) => {
            created.push(data);
            return data;
          },
        },
      },
    },
  };
}

describe("transcribeResumePage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not call the vision model when the application opted out", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { created, scope } = audit(true);

    const text = await transcribeResumePage(image, scope);

    expect(text).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
  });

  it("persists an AIRun when evaluation is allowed", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Jane Doe\nEngineer" } }],
          usage: { prompt_tokens: 11, completion_tokens: 4 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { created, scope } = audit(false);

    const text = await transcribeResumePage(image, scope);

    expect(text).toBe("Jane Doe\nEngineer");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      companyId: 9,
      feature: "resume_vision",
      entityType: "Application",
      entityId: 44,
      modelId: "gpt-4o-mini",
      promptVersion: "resume-vision-1",
      reviewerAction: "PENDING",
      promptTokens: 11,
      completionTokens: 4,
      outputJson: { pageCount: 2, pageIndex: 0, textLength: "Jane Doe\nEngineer".length, error: null },
    });
    const output = JSON.stringify((created[0] as { outputJson: unknown }).outputJson);
    expect(output).not.toContain("Jane Doe");
    const stored = created[0] as { inputHash: string };
    expect(stored.inputHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
