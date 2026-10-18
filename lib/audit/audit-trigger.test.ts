import { describe, expect, it } from "vitest";

import { assertAuditLogTriggers } from "@/lib/audit/assert-audit-trigger";
import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";

describe("audit log triggers", () => {
  it("finds both append-only triggers", async () => {
    await expect(assertAuditLogTriggers()).resolves.toBeUndefined();
    const rows = await prisma.$queryRaw<Array<{ tgname: string }>>`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = '"AuditLog"'::regclass AND NOT tgisinternal
    `;
    const names = rows.map((row) => row.tgname).sort();
    expect(names).toEqual(expect.arrayContaining(["audit_log_immutable", "audit_log_no_truncate"]));
  });

  it("rejects UPDATE, DELETE, and TRUNCATE", async () => {
    await assertAuditLogTriggers();
    const company = await prisma.company.create({
      data: {
        name: `audit-${Date.now()}`,
        industry: "Test",
        employees: 1,
        publicSlug: `audit-${Date.now()}`,
      },
    });
    const actor = await prisma.user.create({
      data: {
        email: `audit-${Date.now()}@hireiq.test`,
        name: "Auditor",
        role: "ADMIN",
        passwordHash: "not-a-login",
        emailVerifiedAt: new Date(),
      },
    });
    await writeAuditLog(prisma, {
      actorUserId: actor.id,
      actorRole: "ADMIN",
      companyId: company.id,
      action: "FILE_CHANGED",
      targetType: "COMPANY",
      targetId: company.id,
      reason: "trigger check",
    });
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { companyId: company.id, action: "FILE_CHANGED" },
    });

    await expect(
      prisma.$executeRaw`UPDATE "AuditLog" SET reason = 'rewritten' WHERE id = ${row.id}`,
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$executeRaw`DELETE FROM "AuditLog" WHERE id = ${row.id}`,
    ).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRaw`TRUNCATE TABLE "AuditLog"`).rejects.toThrow(/append-only/);

    const stillThere = await prisma.auditLog.findUnique({ where: { id: row.id } });
    expect(stillThere?.reason).toBe("trigger check");
  });
});
