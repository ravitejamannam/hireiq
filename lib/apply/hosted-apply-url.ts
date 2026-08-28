import { getPublicAppUrl } from "@/lib/communication/email-config";

/**
 * Snapshots store an absolute APP_URL. First-party UI must not send
 * candidates to a stale origin (wrong local port, old domain).
 */
export function hostedApplyTokenFromSnapshot(applyUrl: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(applyUrl).pathname;
  } catch {
    if (!applyUrl.startsWith("/")) {
      return null;
    }
    pathname = applyUrl.split("?")[0] ?? "";
  }

  const prefix = "/apply/";
  if (!pathname.startsWith(prefix)) {
    return null;
  }

  const token = pathname.slice(prefix.length);
  if (!token || token.includes("/")) {
    return null;
  }

  return token;
}

export function hostedApplyPathFromSnapshot(applyUrl: string): string | null {
  const token = hostedApplyTokenFromSnapshot(applyUrl);
  return token ? `/apply/${token}` : null;
}

export function publicAbsoluteApplyUrl(
  snapshot: string,
  origin: string | null = getPublicAppUrl(),
): string {
  const path = hostedApplyPathFromSnapshot(snapshot);
  if (!path) {
    return snapshot;
  }
  if (!origin) {
    return path;
  }
  return `${origin}${path}`;
}
