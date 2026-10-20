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

const EMAIL_PATTERN = /[A-Z0-9._%+'-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi;

/**
 * Defence in depth. Audit rows are append-only, so an address that slips into a reason can never be removed.
 * Callers should still write structured text. This only masks addresses; it cannot detect names or other content.
 */
export function maskEmailAddresses(text: string) {
  return text.replace(EMAIL_PATTERN, "[email]");
}

/**
 * Actors that are not users. Their rows must have no user id: a user id here would name someone who did not act.
 * Every other role is a user and must carry a real (positive) user id.
 */
export const NON_USER_AUDIT_ROLES = ["CANDIDATE", "CANDIDATE_TOKEN", "SCIM", "SYSTEM_RETENTION"] as const;

export function assertAuditActor(actorRole: string, actorUserId: number | null, scimTokenId: number | null = null) {
  // A SCIM row names the credential that acted (its row id, never the secret); no other role carries one.
  if (actorRole === "SCIM") {
    if (scimTokenId === null || !Number.isInteger(scimTokenId) || scimTokenId <= 0) throw new Error("Audit role SCIM needs the id of the SCIM credential.");
  } else if (scimTokenId !== null) {
    throw new Error(`Audit role ${actorRole} must not carry a SCIM credential id.`);
  }
  const nonUser = (NON_USER_AUDIT_ROLES as readonly string[]).includes(actorRole);
  if (nonUser && actorUserId !== null) throw new Error(`Audit role ${actorRole} is not a user and must not carry a user id.`);
  if (!nonUser && (actorUserId === null || !Number.isInteger(actorUserId) || actorUserId <= 0)) {
    throw new Error(`Audit role ${actorRole} needs a real user id.`);
  }
}

/** Throws if the row cannot be written. Callers decide whether that rolls back their work; none may swallow it silently. */
export async function writeAuditLog(
  db: AuditDb,
  input: {
    /** Null only for actors that are not users (candidate portal). Never substitute an administrator. */
    actorUserId: number | null;
    actorRole: string;
    /** Row id of the SCIM credential, for role SCIM only. Never a token or hash. */
    scimTokenId?: number | null;
    companyId: number;
    action: string;
    targetType: string;
    targetId: number;
    reason?: string | null;
  },
) {
  assertAuditActor(input.actorRole, input.actorUserId, input.scimTokenId ?? null);
  const reason = input.reason?.trim() ? maskEmailAddresses(input.reason.trim()).slice(0, 500) : null;
  await db.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      scimTokenId: input.scimTokenId ?? null,
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
