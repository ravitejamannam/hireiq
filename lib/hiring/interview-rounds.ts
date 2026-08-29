import { InterviewType } from "@prisma/client";

export const DEFAULT_INTERVIEW_ROUND_PLAN: InterviewType[] = [
  InterviewType.PHONE_SCREEN,
  InterviewType.TECHNICAL,
];

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  PHONE_SCREEN: "Phone screen",
  TECHNICAL: "Technical",
  SYSTEM_DESIGN: "System design",
  HR: "HR",
};

export const INTERVIEW_RESULT_LABELS: Record<string, string> = {
  PENDING: "Pending",
  PASSED: "Passed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export function normalizeInterviewRoundPlan(
  stored: InterviewType[] | null | undefined,
): InterviewType[] {
  if (!stored || stored.length === 0) {
    return [...DEFAULT_INTERVIEW_ROUND_PLAN];
  }

  const seen = new Set<InterviewType>();
  const plan: InterviewType[] = [];
  for (const type of stored) {
    if (!Object.values(InterviewType).includes(type) || seen.has(type)) {
      continue;
    }
    seen.add(type);
    plan.push(type);
  }
  return plan.length > 0 ? plan : [...DEFAULT_INTERVIEW_ROUND_PLAN];
}

export function parseInterviewRoundPlanInput(
  value: unknown,
): InterviewType[] | null {
  if (!Array.isArray(value)) return null;
  const plan: InterviewType[] = [];
  const seen = new Set<InterviewType>();
  for (const item of value) {
    if (typeof item !== "string") return null;
    if (!Object.values(InterviewType).includes(item as InterviewType)) {
      return null;
    }
    const type = item as InterviewType;
    if (seen.has(type)) continue;
    seen.add(type);
    plan.push(type);
  }
  return plan;
}

export type InterviewRoundProgress = {
  type: InterviewType;
  label: string;
  sortOrder: number;
  booked: number;
  completed: number;
};

export function interviewRoundProgress(
  plan: InterviewType[],
  interviews: Array<{ type: InterviewType; result: string }>,
): InterviewRoundProgress[] {
  const normalized = normalizeInterviewRoundPlan(plan);
  return normalized.map((type, sortOrder) => {
    const forType = interviews.filter((interview) => interview.type === type);
    return {
      type,
      label: INTERVIEW_TYPE_LABELS[type],
      sortOrder,
      booked: forType.length,
      completed: forType.filter(
        (interview) => interview.result === "PASSED" || interview.result === "FAILED",
      ).length,
    };
  });
}
