import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AuditDb = Prisma.TransactionClient | typeof prisma;

/** Test cleanup only. Production deletes stay rejected by the database trigger. */
export async function deleteAuditLogsForTests(where: Prisma.AuditLogWhereInput) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('hireiq.allow_audit_delete', 'on', true)`);
    await tx.auditLog.deleteMany({ where });
  });
}

export async function writeAuditLog(
  db: AuditDb,
  input: {
    actorUserId: number;
    actorRole: string;
    companyId: number;
    action: string;
    targetType: string;
    targetId: number;
    reason?: string | null;
  },
) {
  const reason = input.reason?.trim() ? input.reason.trim().slice(0, 500) : null;
  await db.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      companyId: input.companyId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      reason,
    },
  });
}

export function auditActionForStatus(nextStatus: string) {
  if (nextStatus === "HIRED") return "HIRE_CONFIRMED";
  if (nextStatus === "REJECTED") return "APPLICATION_REJECTED";
  return "APPLICATION_STAGE_CHANGED";
}
