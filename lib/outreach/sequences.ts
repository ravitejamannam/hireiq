import { withAIRun, type AiRunActor, type AiRunCallSubject } from "@/lib/ai/run";

export type Step = { position: number; subject: string; body: string; approvedAt: string | null };
export type Enrollment = { companyId: number; applicationId: number; status: "ACTIVE" | "PAUSED_REPLY" | "UNSUBSCRIBED"; currentStep: number };

export async function draftOutreachEmail(input: {
  companyId: number;
  applicationId: number;
  candidateName: string;
  role: string;
  actor: AiRunActor;
  subject: AiRunCallSubject | null;
  complete: (prompt: string) => Promise<{ subject: string; body: string }>;
}) {
  const draft = await withAIRun("outreach_draft", input.actor, input.subject, async () => {
    const value = await input.complete(`Draft one email to ${input.candidateName} about ${input.role}. Do not send it.`);
    return { value, output: value };
  });
  return {
    ...draft,
    sent: false as const,
    audit: {
      companyId: input.companyId,
      action: "OUTREACH_DRAFT",
      targetType: "Application",
      targetId: input.applicationId,
      reason: "Draft only. A recruiter must approve before send.",
    },
  };
}

export function sendNextStep(input: { steps: Step[]; enrollment: Enrollment; actorCompanyId: number }) {
  if (input.actorCompanyId !== input.enrollment.companyId) return { sent: false, error: "Candidate not found." };
  if (input.enrollment.status !== "ACTIVE") return { sent: false, error: "This sequence is paused." };
  const step = input.steps.find((row) => row.position === input.enrollment.currentStep);
  if (!step?.approvedAt) return { sent: false, error: "Approve this email before sending." };
  return {
    sent: true,
    step,
    audit: {
      companyId: input.enrollment.companyId,
      action: "OUTREACH_SENT",
      targetType: "Application",
      targetId: input.enrollment.applicationId,
      reason: `Step ${step.position} sent after approval.`,
    },
  };
}

export function unsubscribe(enrollment: Enrollment): Enrollment {
  return { ...enrollment, status: "UNSUBSCRIBED" };
}

export function pauseOnReply(enrollment: Enrollment): Enrollment {
  return enrollment.status === "UNSUBSCRIBED" ? enrollment : { ...enrollment, status: "PAUSED_REPLY" };
}
