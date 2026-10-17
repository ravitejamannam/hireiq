import { requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

export const AUDIT_PAGE_SIZE = 25;

export async function getAuditLogPage(input: {
  page?: number;
  companyId?: number;
}) {
  await requireAdmin();
  const page = Number.isInteger(input.page) && (input.page ?? 0) > 0 ? input.page! : 1;
  const where =
    Number.isInteger(input.companyId) && (input.companyId ?? 0) > 0
      ? { companyId: input.companyId }
      : {};
  const [entries, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      select: {
        id: true,
        occurredAt: true,
        actorUserId: true,
        actorRole: true,
        companyId: true,
        action: true,
        targetType: true,
        targetId: true,
        reason: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return {
    entries,
    total,
    page,
    pageSize: AUDIT_PAGE_SIZE,
  };
}
