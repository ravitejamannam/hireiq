export type PromptDefinition = {
  feature: string;
  version: string;
  timeoutMs: number;
  maxRetries: number;
  outputSchema: Record<string, unknown>;
};

export const PROMPT_REGISTRY = {
  job_description: {
    feature: "job_description",
    version: "jd-mvp-1",
    timeoutMs: 20_000,
    maxRetries: 1,
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["summary"],
      properties: { summary: { type: "string" } },
    },
  },
  interview_question: {
    feature: "interview_question",
    version: "kit-mvp-1",
    timeoutMs: 20_000,
    maxRetries: 1,
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["intent", "question", "followUps", "anchorLow", "anchorMid", "anchorHigh"],
      properties: {
        intent: { type: "string" },
        question: { type: "string" },
        followUps: { type: "array", items: { type: "string" } },
        anchorLow: { type: "string" },
        anchorMid: { type: "string" },
        anchorHigh: { type: "string" },
      },
    },
  },
} as const satisfies Record<string, PromptDefinition>;

export function getPrompt(feature: keyof typeof PROMPT_REGISTRY) {
  return PROMPT_REGISTRY[feature];
}
