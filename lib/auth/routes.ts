import { PortalRole } from "@prisma/client";

import { clientPostAuthPath } from "@/lib/auth/onboarding-state";

export function homePathForRole(role: PortalRole) {
  if (role === PortalRole.CLIENT) {
    return clientPostAuthPath();
  }

  if (role === PortalRole.INTERVIEWER) {
    return "/interviewer";
  }

  return "/dashboard";
}

/**
 * Allow only same-origin relative callbacks used by verification and invites.
 * Open redirects are rejected.
 */
export function safeInternalCallbackPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  if (value.includes("://") || value.includes("\\")) {
    return null;
  }

  if (
    value.startsWith("/verify-email/") ||
    value.startsWith("/invite/") ||
    value.startsWith("/interviewer-invite/") ||
    value === "/post-auth" ||
    value === "/onboarding" ||
    value.startsWith("/onboarding/")
  ) {
    return value;
  }

  return null;
}
