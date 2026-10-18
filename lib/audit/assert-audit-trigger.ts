import { prisma } from "@/lib/prisma";

const REQUIRED_TRIGGERS = ["audit_log_immutable", "audit_log_no_truncate"] as const;

/** Fails when migrate deploy did not install the append-only triggers. */
export async function assertAuditLogTriggers() {
  const rows = await prisma.$queryRaw<Array<{ tgname: string }>>`
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = '"AuditLog"'::regclass
      AND NOT tgisinternal
      AND tgname IN ('audit_log_immutable', 'audit_log_no_truncate')
  `;
  const found = new Set(rows.map((row) => row.tgname));
  const missing = REQUIRED_TRIGGERS.filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Audit log triggers missing: ${missing.join(", ")}. Run prisma migrate deploy.`,
    );
  }
}
