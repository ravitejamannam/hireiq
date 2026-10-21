import type { BasicInput } from "@/lib/screening/prioritization";

export type StoredGrade = {
  itemId: string;
  score: number | null;
  needsHuman: boolean;
};

export function parseStoredGrades(value: unknown): StoredGrade[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    if (typeof record.itemId !== "string") return [];
    return [
      {
        itemId: record.itemId,
        score: typeof record.score === "number" && Number.isFinite(record.score) ? record.score : null,
        needsHuman: record.needsHuman === true,
      },
    ];
  });
}

/** Points available per item type. Written and coding items are graded 0–5. */
export function itemMaxPoints(type: string) {
  return type === "multiple_choice" ? 1 : 5;
}

export function generatedVersionKey(assessmentId: number) {
  return `generated:${String(assessmentId).padStart(8, "0")}`;
}

export function bankVersionKey(roleCategory: string) {
  return `bank:${roleCategory}`;
}

export type GeneratedInviteRow = {
  assessmentId: number;
  startedAt: Date | null;
  submittedAt: Date | null;
  gradedAt: Date | null;
  expiresAt: Date;
  grades: unknown;
};

export function generatedBasicResult(invite: GeneratedInviteRow, itemTypes: Map<string, string>, now: Date): BasicInput {
  const versionKey = generatedVersionKey(invite.assessmentId);
  if (!invite.submittedAt) {
    if (invite.expiresAt.getTime() <= now.getTime()) return { state: "EXPIRED" };
    return invite.startedAt ? { state: "IN_PROGRESS", deadline: invite.expiresAt } : { state: "INVITED", deadline: invite.expiresAt };
  }
  const grades = parseStoredGrades(invite.grades);
  if (!invite.gradedAt || grades.length === 0 || grades.some((grade) => grade.needsHuman || grade.score === null)) {
    return { state: "PENDING_GRADING", versionKey };
  }
  let earned = 0;
  let available = 0;
  for (const grade of grades) {
    const type = itemTypes.get(grade.itemId);
    if (!type) return { state: "PENDING_GRADING", versionKey };
    const max = itemMaxPoints(type);
    earned += Math.min(Math.max(grade.score ?? 0, 0), max);
    available += max;
  }
  return { state: "COMPLETED", percent: (earned / available) * 100, versionKey };
}

export type BankInviteRow = {
  roleCategory: string;
  expiresAt: Date;
  startedAt: Date | null;
  revokedAt: Date | null;
  attempt: { status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED"; score: number; maxScore: number } | null;
};

export function bankBasicResult(invite: BankInviteRow, now: Date): BasicInput {
  if (invite.revokedAt || !invite.attempt) return { state: "NOT_INVITED" };
  const { attempt } = invite;
  if (attempt.status === "COMPLETED") {
    if (attempt.maxScore <= 0) return { state: "PENDING_GRADING", versionKey: bankVersionKey(invite.roleCategory) };
    return { state: "COMPLETED", percent: (attempt.score / attempt.maxScore) * 100, versionKey: bankVersionKey(invite.roleCategory) };
  }
  if (attempt.status === "EXPIRED" || invite.expiresAt.getTime() <= now.getTime()) return { state: "EXPIRED" };
  return attempt.status === "IN_PROGRESS" || invite.startedAt
    ? { state: "IN_PROGRESS", deadline: invite.expiresAt }
    : { state: "INVITED", deadline: invite.expiresAt };
}

const ORDER: Record<BasicInput["state"], number> = {
  COMPLETED: 0,
  PENDING_GRADING: 1,
  IN_PROGRESS: 2,
  INVITED: 3,
  EXPIRED: 4,
  NOT_INVITED: 5,
};

/**
 * Pick the result that best represents the candidate. Finished work beats
 * work in progress; the job-specific assessment beats the role bank when
 * both are at the same stage.
 */
export function chooseBasicResult(generated: BasicInput | null, bank: BasicInput | null): BasicInput {
  const options = [generated, bank].filter((value): value is BasicInput => value !== null);
  if (options.length === 0) return { state: "NOT_INVITED" };
  return options.reduce((best, option) => (ORDER[option.state] < ORDER[best.state] ? option : best));
}
