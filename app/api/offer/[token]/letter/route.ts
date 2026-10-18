import { NextResponse } from "next/server";

import { consumeAuthRateLimit, rateLimitKeyForIp, RateLimitError } from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";
import { findApplicationByOfferToken } from "@/lib/offers/offer-acceptance";
import { renderOfferDocumentHtml } from "@/lib/offers/offer-documents";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/offer/[token]/letter — joining letter after acceptance only.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  try {
    await consumeAuthRateLimit({ name: "offerLetterIp", key: rateLimitKeyForIp(await readRequestIp()) });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ ok: false, error: "Too many attempts. Try again later." }, { status: 429, headers: NO_STORE });
    }
    throw error;
  }
  const application = await findApplicationByOfferToken(token);

  if (!application?.offerAcceptedAt) {
    return NextResponse.json(
      { ok: false, error: "Joining letter is available after the offer is accepted." },
      { status: 404, headers: NO_STORE },
    );
  }

  const html = renderOfferDocumentHtml({
    kind: "joining",
    candidateName: application.candidate.name,
    jobTitle: application.job.title,
    companyName: application.job.company.name,
    location: application.job.location ?? application.candidate.location,
    compensation:
      application.offerCompensation?.trim() ||
      application.candidate.expectedCTC ||
      "As discussed",
    terms: application.offerTerms,
    proposedStartDate: application.proposedStartDate,
    acceptedAt: application.offerAcceptedAt,
  });

  return new NextResponse(html, {
    status: 200,
    headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" },
  });
}
