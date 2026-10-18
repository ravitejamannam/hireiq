export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }

  const { assertProductionEnv } = await import("@/lib/production/assert-env");
  assertProductionEnv();
  const { assertAuditLogTriggers } = await import("@/lib/audit/assert-audit-trigger");
  await assertAuditLogTriggers();
}
