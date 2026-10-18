export const SHADOW_REQUIRED = 2;
export const REVERSE_SHADOW_REQUIRED = 2;

export type TrainingRecord = {
  companyId: number;
  interviewerId: number;
  shadowSessions: number;
  reverseShadowSessions: number;
  qualifiedAt: string | null;
};

export function recordObservation(input: {
  record: TrainingRecord;
  actorCompanyId: number;
  kind: "SHADOW" | "REVERSE";
  now: Date;
}) {
  if (input.actorCompanyId !== input.record.companyId) return { ok: false as const, error: "Interviewer not found." };
  const record = { ...input.record };
  if (input.kind === "SHADOW") record.shadowSessions += 1;
  else record.reverseShadowSessions += 1;
  const ready = record.shadowSessions >= SHADOW_REQUIRED && record.reverseShadowSessions >= REVERSE_SHADOW_REQUIRED;
  if (ready && !record.qualifiedAt) record.qualifiedAt = input.now.toISOString();
  return {
    ok: true as const,
    record,
    audit: {
      companyId: record.companyId,
      action: input.kind === "SHADOW" ? "INTERVIEW_SHADOW_RECORDED" : "INTERVIEW_REVERSE_SHADOW_RECORDED",
      targetType: "Interviewer",
      targetId: record.interviewerId,
      reason: record.qualifiedAt ? "Qualified to lead." : "Still in training.",
    },
  };
}

export function leadAssignmentAllowed(input: { requireQualifiedLead: boolean; record: TrainingRecord | null; jobCompanyId: number; interviewerCompanyId: number }) {
  if (input.jobCompanyId !== input.interviewerCompanyId) return { ok: false, error: "Interviewer not found." };
  if (!input.requireQualifiedLead) return { ok: true, error: null };
  if (!input.record?.qualifiedAt) return { ok: false, error: "This interviewer is not qualified to lead yet." };
  return { ok: true, error: null };
}
