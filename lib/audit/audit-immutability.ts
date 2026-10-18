const FORBIDDEN = new Set(["update", "delete", "updateMany", "deleteMany", "upsert"]);

/** AuditLog is append-only. Tenant admins have no update or delete path. */
export function rejectAuditMutation(operation: string): never {
  if (FORBIDDEN.has(operation)) {
    throw new Error(`AuditLog is append-only. Refusing ${operation}.`);
  }
  throw new Error(`Unsupported AuditLog operation ${operation}.`);
}

export function auditCoversMutation(action: string) {
  return (
    action.startsWith("APPLICATION_") ||
    action.startsWith("REQUIREMENT_") ||
    action.startsWith("AI_") ||
    action === "HIRE_CONFIRMED" ||
    action === "FILE_CHANGED" ||
    action === "RETRIEVAL_CACHE_CHANGED"
  );
}
