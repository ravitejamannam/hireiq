import { timingSafeEqual } from "node:crypto";

export function bearerCronSecretMatches(
  authorizationHeader: string | null,
  secret = process.env.CRON_SECRET,
): boolean {
  const configured = secret?.trim();
  if (!configured) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${configured}`);
  const provided = Buffer.from(authorizationHeader ?? "");
  if (expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(expected, provided);
}

export function headerSecretMatches(
  provided: string | null | undefined,
  configured: string | undefined,
): boolean {
  const expected = configured?.trim();
  const actual = provided?.trim();
  if (!expected || !actual) {
    return false;
  }
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
