import { cookies } from "next/headers";

import { RateLimitError, consumeAuthRateLimit, rateLimitKeyForEmail, rateLimitKeyForIp } from "@/lib/auth/rate-limit";
import { normalizePortalEmail, sessionExpiry } from "@/lib/portal/candidate-portal";
import {
  cancelPortalInterview,
  consumeMagicLink,
  createMagicLink,
  exportPortalData,
  issueAssessmentHandoff,
  issuePortalBookingLink,
  queueDeletion,
  requestPortalHumanReview,
  savePortalDocument,
  setFutureRolesConsent,
  setOptOut,
  unsubscribeApplication,
  withdrawApplication,
} from "@/lib/portal/portal-service";
import { PORTAL_COOKIE, readPortalSession, signPortalSession } from "@/lib/portal/portal-session";

function redirectTo(request: Request, path: string) {
  return Response.redirect(new URL(path, request.url), 303);
}

async function sessionEmail() {
  const jar = await cookies();
  return readPortalSession(jar.get(PORTAL_COOKIE)?.value)?.email ?? null;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const origin = new URL(request.url).origin;

  if (intent === "magic-link") {
    const email = normalizePortalEmail(String(form.get("email") ?? ""));
    if (!email.includes("@")) return redirectTo(request, "/portal?error=invalid");
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
    try {
      await consumeAuthRateLimit({ name: "portalMagicLinkEmail", key: rateLimitKeyForEmail(email) });
      await consumeAuthRateLimit({ name: "portalMagicLinkIp", key: rateLimitKeyForIp(ip) });
    } catch (error) {
      if (error instanceof RateLimitError) return redirectTo(request, "/portal?error=rate");
      throw error;
    }
    await createMagicLink(email, origin);
    return redirectTo(request, "/portal?sent=1");
  }

  const email = await sessionEmail();
  if (!email) return redirectTo(request, "/portal?error=expired");
  const applicationId = Number(form.get("applicationId"));
  const back = `/portal/applications/${applicationId}`;

  if (intent === "opt-out") {
    await setOptOut(applicationId, email, true);
  } else if (intent === "opt-in") {
    await setOptOut(applicationId, email, false);
  } else if (intent === "future-roles") {
    await setFutureRolesConsent(applicationId, email, String(form.get("allowed")) === "yes");
  } else if (intent === "human-review") {
    await requestPortalHumanReview(applicationId, email);
  } else if (intent === "withdraw") {
    await withdrawApplication(applicationId, email, String(form.get("reason") ?? ""));
  } else if (intent === "unsubscribe") {
    await unsubscribeApplication(applicationId, email);
  } else if (intent === "delete") {
    await queueDeletion(applicationId, email);
  } else if (intent === "cancel-interview") {
    await cancelPortalInterview(email, applicationId);
  } else if (intent === "reschedule") {
    const url = await issuePortalBookingLink(email, applicationId, origin);
    if (url) return Response.redirect(url, 303);
  } else if (intent === "assess") {
    const url = await issueAssessmentHandoff(email, applicationId, origin);
    if (url) return Response.redirect(url, 303);
  } else if (intent === "upload") {
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "RESUME");
    if (!(file instanceof File)) return redirectTo(request, `${back}?error=${encodeURIComponent("Choose a file.")}`);
    const saved = await savePortalDocument({
      email,
      applicationId,
      kind: kind === "COVER_LETTER" || kind === "CERTIFICATE" ? kind : "RESUME",
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    if ("error" in saved && saved.error) return redirectTo(request, `${back}?error=${encodeURIComponent(saved.error)}`);
  }
  return redirectTo(request, back);
}

export async function enterPortal(rawToken: string) {
  const link = await consumeMagicLink(rawToken);
  if (!link) return null;
  const jar = await cookies();
  jar.set(PORTAL_COOKIE, signPortalSession(link.email, sessionExpiry()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  return link.email;
}

export async function portalExportResponse(request: Request) {
  const email = await sessionEmail();
  if (!email) return redirectTo(request, "/portal");
  const data = await exportPortalData(email);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": "attachment; filename=hireiq-data.json",
    },
  });
}
