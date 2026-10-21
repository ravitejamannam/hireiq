import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";

/**
 * Recruiter-defined must-haves, asked as yes/no questions on the application
 * form. They reuse KnockoutQuestion. A non-matching answer marks the
 * application for the "Doesn't meet stated requirements" view; it never
 * changes the application's status.
 */

export const MUST_HAVE_MIN = 3;
export const MUST_HAVE_MAX = 5;

const mustHaveSchema = z
  .object({
    requirement: z.string().trim().min(3).max(200),
    question: z.string().trim().min(8).max(300),
    expectedAnswer: z.enum(["yes", "no"]),
  })
  .strict();

export const mustHaveListSchema = z
  .array(mustHaveSchema)
  .refine((items) => items.length === 0 || (items.length >= MUST_HAVE_MIN && items.length <= MUST_HAVE_MAX), {
    message: `Define between ${MUST_HAVE_MIN} and ${MUST_HAVE_MAX} must-haves, or none.`,
  })
  .refine((items) => new Set(items.map((item) => item.question.toLowerCase())).size === items.length, {
    message: "Each must-have needs its own question.",
  });

export type MustHave = z.infer<typeof mustHaveSchema>;

/** Stored as one prompt so the existing application form renders it unchanged. */
export function mustHavePrompt(item: MustHave) {
  return `${item.requirement}: ${item.question}`;
}

export function splitMustHavePrompt(prompt: string): Pick<MustHave, "requirement" | "question"> {
  const at = prompt.indexOf(": ");
  return at > 0 ? { requirement: prompt.slice(0, at), question: prompt.slice(at + 2) } : { requirement: prompt, question: prompt };
}

export async function listMustHaves(jobId: number, companyId: number): Promise<MustHave[]> {
  const rows = await prisma.knockoutQuestion.findMany({
    where: { jobId, companyId },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
    select: { prompt: true, expectedAnswer: true },
  });
  return rows.map((row) => ({
    ...splitMustHavePrompt(row.prompt),
    expectedAnswer: row.expectedAnswer.trim().toLowerCase() === "no" ? "no" : "yes",
  }));
}

export async function saveMustHaves(input: {
  jobId: number;
  companyId: number;
  actorUserId: number;
  items: unknown;
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const parsed = mustHaveListSchema.safeParse(input.items);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the must-haves." };
  const job = await prisma.job.findFirst({ where: { id: input.jobId, companyId: input.companyId }, select: { id: true } });
  if (!job) return { ok: false, error: "Job not found." };

  const items = parsed.data;
  await prisma.$transaction(async (tx) => {
    const existing = await tx.knockoutQuestion.findMany({
      where: { jobId: input.jobId, companyId: input.companyId },
      orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    for (const [index, item] of items.entries()) {
      const data = { prompt: mustHavePrompt(item), expectedAnswer: item.expectedAnswer, displayOrder: index };
      const row = existing[index];
      if (row) await tx.knockoutQuestion.update({ where: { id: row.id }, data });
      else await tx.knockoutQuestion.create({ data: { ...data, jobId: input.jobId, companyId: input.companyId } });
    }
    const extra = existing.slice(items.length).map((row) => row.id);
    if (extra.length > 0) await tx.knockoutQuestion.deleteMany({ where: { id: { in: extra }, companyId: input.companyId } });
    await writeAuditLog(tx, {
      actorUserId: input.actorUserId,
      actorRole: "ADMIN",
      companyId: input.companyId,
      action: "MUST_HAVES_SAVED",
      targetType: "JOB",
      targetId: input.jobId,
      reason: items.map((item) => `${mustHavePrompt(item)} [${item.expectedAnswer}]`).join(" | ") || "cleared",
    });
  });
  return { ok: true, count: items.length };
}
