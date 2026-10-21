import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Closes the in-flight erasure race.
 *
 * Erasure writes the Candidate.erasedAt tombstone first. Any write that could put candidate data back
 * (parse result, evidence, claims, grades, embeddings, AI output, a send) runs inside this guard:
 * it takes a row-level FOR SHARE lock on the Candidate row and re-reads erasedAt in the same transaction.
 *
 * - If the tombstone is already committed, the guard refuses and the write is not made.
 * - If the write holds the lock first, the tombstone UPDATE waits until the write commits. The later
 *   erasure steps then find that data and remove it, because they run after the tombstone.
 *
 * No new table or advisory key is needed. The same Candidate row is the lock.
 */

export type GuardResult<T> = { ok: true; value: T } | { ok: false };

/** Locks the candidate row for the rest of the transaction. False means gone or erased. */
export async function lockCandidateForWrite(tx: Prisma.TransactionClient, candidateId: number, companyId: number): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ erasedAt: Date | null }>>`
    SELECT "erasedAt" FROM "Candidate" WHERE id = ${candidateId} AND "companyId" = ${companyId} FOR SHARE`;
  return rows.length === 1 && rows[0]!.erasedAt === null;
}

export async function withCandidateWriteGuard<T>(
  candidateId: number,
  companyId: number,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<GuardResult<T>> {
  return prisma.$transaction(
    async (tx) => {
      if (!(await lockCandidateForWrite(tx, candidateId, companyId))) return { ok: false } as const;
      return { ok: true, value: await fn(tx) } as const;
    },
    { timeout: options.timeoutMs ?? 10_000, maxWait: 10_000 },
  );
}

/**
 * For writes that arrive through a candidate's token (assessment, practical, status link). The token resolves to an
 * application, and the application names its candidate. A missing application counts as refused.
 */
export async function withApplicationWriteGuard<T>(
  applicationId: number,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { timeoutMs?: number } = {},
): Promise<GuardResult<T>> {
  const owner = await prisma.application.findUnique({ where: { id: applicationId }, select: { candidateId: true, companyId: true } });
  if (!owner) return { ok: false };
  return withCandidateWriteGuard(owner.candidateId, owner.companyId, fn, options);
}

/** Which candidate an AIRun entity belongs to. Null when the entity is not candidate-specific or cannot be resolved. */
export async function candidateIdForAiEntity(companyId: number, entityType: string, entityId: number): Promise<number | null> {
  switch (entityType) {
    case "Candidate":
      return entityId;
    case "CandidateEvidence":
      return (await prisma.candidateEvidence.findFirst({ where: { id: entityId, companyId }, select: { candidateId: true } }))?.candidateId ?? null;
    case "CandidateResumeDocument":
      return (await prisma.candidateResumeDocument.findFirst({ where: { id: entityId, companyId }, select: { candidateId: true } }))?.candidateId ?? null;
    case "Application":
      return (await prisma.application.findFirst({ where: { id: entityId, companyId }, select: { candidateId: true } }))?.candidateId ?? null;
    case "GeneratedAssessmentInvite": {
      const invite = await prisma.generatedAssessmentInvite.findUnique({ where: { id: entityId }, select: { applicationId: true } });
      return invite ? (await prisma.application.findFirst({ where: { id: invite.applicationId, companyId }, select: { candidateId: true } }))?.candidateId ?? null : null;
    }
    case "CodingTest": {
      const test = await prisma.codingTest.findUnique({ where: { id: entityId }, select: { application: { select: { candidateId: true, companyId: true } } } });
      return test && test.application.companyId === companyId ? test.application.candidateId : null;
    }
    case "HostedApplyResumeUpload": {
      const upload = await prisma.hostedApplyResumeUpload.findFirst({ where: { id: entityId, companyId }, select: { hostedApplySubmissionId: true } });
      if (!upload?.hostedApplySubmissionId) return null;
      return (await prisma.applicationIngestionEvent.findFirst({ where: { hostedApplySubmissionId: upload.hostedApplySubmissionId, companyId }, select: { candidateId: true } }))?.candidateId ?? null;
    }
    default:
      return null;
  }
}

type AiRunWriter = { aIRun: { create: (args: { data: never }) => Promise<unknown> } };

/**
 * The single place an AIRun row is written. For a real database client and a candidate-specific entity the
 * write goes through the erasure guard, so a model call that finished after erasure leaves no output behind.
 * Returns false when the row was not written because the candidate is erased.
 */
export async function createAiRunUnlessErased(db: unknown, data: { companyId: number; entityType: string; entityId: number; [key: string]: unknown }): Promise<boolean> {
  if (db !== prisma) {
    await (db as AiRunWriter).aIRun.create({ data: data as never });
    return true;
  }
  const candidateId = await candidateIdForAiEntity(data.companyId, data.entityType, data.entityId);
  if (candidateId === null) {
    await prisma.aIRun.create({ data: data as never });
    return true;
  }
  const result = await withCandidateWriteGuard(candidateId, data.companyId, (tx) => tx.aIRun.create({ data: data as never }));
  return result.ok;
}

type RowWriterDb = Prisma.TransactionClient | typeof prisma;

/**
 * Writes rows that each name a candidate (retrieval snapshots). Rows for an erased candidate are dropped, and the
 * live candidates stay locked until the write commits. Rows for other candidates are written normally.
 */
export async function writeRowsForLiveCandidates<R extends { candidateId: number }>(
  db: RowWriterDb,
  companyId: number,
  rows: R[],
  write: (tx: Prisma.TransactionClient, live: R[]) => Promise<unknown>,
): Promise<void> {
  const run = async (tx: Prisma.TransactionClient) => {
    const live = new Set<number>();
    for (const candidateId of [...new Set(rows.map((row) => row.candidateId))].sort((a, b) => a - b)) {
      if (await lockCandidateForWrite(tx, candidateId, companyId)) live.add(candidateId);
    }
    const kept = rows.filter((row) => live.has(row.candidateId));
    if (kept.length > 0) await write(tx, kept);
  };
  if (db === prisma) {
    await prisma.$transaction(run, { timeout: 15_000, maxWait: 10_000 });
    return;
  }
  await run(db as Prisma.TransactionClient);
}
