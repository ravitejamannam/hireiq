import { createHmac, timingSafeEqual } from "node:crypto";

import { linkExpired } from "@/lib/portal/candidate-portal";

export const PORTAL_COOKIE = "hireiq_portal";

export function portalSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET is required for the candidate portal.");
  }
  return "hireiq-portal-dev";
}

export function signPortalSession(email: string, expiresAt: Date, secret = portalSecret()) {
  const body = Buffer.from(JSON.stringify({ email, exp: expiresAt.toISOString() }), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readPortalSession(token: string | undefined, now = new Date(), secret = portalSecret()) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { email?: string; exp?: string };
  if (!parsed.email || !parsed.exp) return null;
  const expiresAt = new Date(parsed.exp);
  if (linkExpired(expiresAt, now)) return null;
  return { email: parsed.email, expiresAt };
}
