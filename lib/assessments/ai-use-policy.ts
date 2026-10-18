import { withAIRun, type AiRunActor, type AiRunCallSubject } from "@/lib/ai/run";

export type AiUsePolicy = "AI_ALLOWED" | "NOT_ALLOWED";

export async function assessmentAssistant(input: {
  policy: AiUsePolicy;
  companyId: number;
  inviteCompanyId: number;
  inviteId: number;
  prompt: string;
  actor: AiRunActor;
  subject: AiRunCallSubject | null;
  complete: (prompt: string) => Promise<string>;
}) {
  if (input.companyId !== input.inviteCompanyId) {
    return { reply: null, logged: [], error: "Assessment not found." };
  }
  if (input.policy !== "AI_ALLOWED") {
    return { reply: null, logged: [], error: "AI use is not allowed on this assessment." };
  }
  const reply = await withAIRun("assessment_assistant", input.actor, input.subject, async () => {
    const value = await input.complete(input.prompt);
    return { value, output: { reply: value } };
  });
  return {
    reply,
    error: null,
    logged: [
      { role: "candidate" as const, body: input.prompt },
      { role: "assistant" as const, body: reply },
    ],
    audit: {
      companyId: input.companyId,
      action: "ASSESSMENT_AI_EXCHANGE",
      targetType: "AssessmentInvite",
      targetId: input.inviteId,
      reason: "Prompt and reply stored for the reviewer.",
    },
  };
}
