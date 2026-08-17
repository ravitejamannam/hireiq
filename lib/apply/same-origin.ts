import { getPublicAppUrl } from "@/lib/communication/email-config";

/**
 * Practical same-origin check for anonymous POST.
 * Missing Origin is allowed (some clients omit it); present Origin must match.
 */
export function isAllowedApplyOrigin(request: Request) {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) {
    return true;
  }

  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }

  if (origin === requestOrigin) {
    return true;
  }

  const configured = getPublicAppUrl();
  return Boolean(configured && origin === configured);
}
