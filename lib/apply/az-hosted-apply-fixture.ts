import { hashSecureToken } from "@/lib/auth/secure-token";

/**
 * An existing hosted apply link is usable only when the snapshot and the
 * single unrevoked token for that distribution describe the same secret.
 */
export function hostedApplyFixtureIsConsistent(input: {
  snapshot: string;
  origin: string;
  unrevokedTokenHashes: readonly string[];
}): boolean {
  if (input.unrevokedTokenHashes.length !== 1) return false;
  let url: URL;
  try {
    url = new URL(input.snapshot);
  } catch {
    return false;
  }
  if (url.origin !== input.origin) return false;
  if (url.search !== "" || url.hash !== "") return false;
  const prefix = "/apply/";
  if (!url.pathname.startsWith(prefix) || url.pathname.endsWith("/")) return false;
  const token = url.pathname.slice(prefix.length);
  if (!token || token.includes("/")) return false;
  if (url.pathname !== `${prefix}${token}`) return false;
  return hashSecureToken(token) === input.unrevokedTokenHashes[0];
}
