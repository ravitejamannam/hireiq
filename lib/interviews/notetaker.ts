import { withAIRun, type AiRunActor, type AiRunCallSubject } from "@/lib/ai/run";

export type AuditEntry = {
  companyId: number;
  action: string;
  targetType: string;
  targetId: number;
  reason: string;
};

export function recordingAllowed(input: { participants: string[]; consents: Array<{ email: string; companyId: number }> ; companyId: number }) {
  const consented = new Set(input.consents.filter((row) => row.companyId === input.companyId).map((row) => row.email.toLowerCase()));
  const missing = input.participants.map((email) => email.toLowerCase()).filter((email) => !consented.has(email));
  return { allowed: missing.length === 0 && input.participants.length > 0, missing };
}

export function evidenceFromNotetaker(input: {
  companyId: number;
  interviewCompanyId: number;
  provider: "METAVIEW" | "BRIGHTHIRE";
  segments: Array<{ quote: string; timestampSec: number; rating?: number }>;
  consentsComplete: boolean;
}) {
  if (input.companyId !== input.interviewCompanyId) {
    return { notes: [], audit: null as AuditEntry | null, error: "Interview not found." };
  }
  if (!input.consentsComplete) {
    return { notes: [], audit: null, error: "Recording needs consent from every participant." };
  }
  const notes = input.segments.map((segment) => ({
    quote: segment.quote,
    timestampSec: segment.timestampSec,
    source: input.provider,
  }));
  return {
    notes,
    error: null,
    audit: {
      companyId: input.companyId,
      action: "NOTETAKER_EVIDENCE_DRAFT",
      targetType: "Interview",
      targetId: 0,
      reason: `${input.provider} quotes stored. Ratings stay with the interviewer.`,
    } satisfies AuditEntry,
  };
}

export async function cleanupManualNotes(input: {
  companyId: number;
  interviewId: number;
  notes: string;
  actor: AiRunActor;
  subject: AiRunCallSubject | null;
  complete: (prompt: string) => Promise<string>;
}) {
  const prompt = `Clean these interview notes into short evidence quotes. Do not add a rating.\n${input.notes}`;
  const text = await withAIRun("interview_notes", input.actor, input.subject, async () => {
    const value = await input.complete(prompt);
    return { value, output: { text: value } };
  });
  return {
    text,
    audit: {
      companyId: input.companyId,
      action: "NOTETAKER_MANUAL_CLEANUP",
      targetType: "Interview",
      targetId: input.interviewId,
      reason: "Manual notes cleaned. No rating was added.",
    } satisfies AuditEntry,
  };
}
