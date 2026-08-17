/**
 * Shared identity-email normalization.
 * Trim + lowercase only. No provider-specific (Gmail) rewriting.
 */
export function normalizeIdentityEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isPlausibleIdentityEmail(normalizedEmail: string) {
  return (
    normalizedEmail.includes("@") &&
    !normalizedEmail.startsWith("@") &&
    !normalizedEmail.endsWith("@")
  );
}
