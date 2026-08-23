import { NextResponse } from "next/server";

import { CANONICAL_FEED_VERSION, escapeXml } from "@/lib/jobs/public-feed/canonical-job";
import { feedETag, verifyFeedToken } from "@/lib/jobs/public-feed/feed-token";
import { listPublicFeedJobs } from "@/lib/jobs/public-feed/public-feed-service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function xml(body: string, status = 200, headers: Record<string, string> = {}) {
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": "application/rss+xml; charset=utf-8", ...headers },
  });
}

function xmlError(message: string, status: number) {
  return xml(
    `<?xml version="1.0" encoding="UTF-8"?>\n<error>${escapeXml(message)}</error>`,
    status,
    NO_STORE,
  );
}

/**
 * GET /feeds/jobs.xml?company={id}&token={signedToken}
 *
 * Public, token-scoped job feed for third-party boards and aggregators.
 * Token is HMAC-verified (constant-time); company id comes from the token,
 * never from trusting the query param alone for authorization.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = verifyFeedToken(url.searchParams.get("token"));
  if (!companyId) {
    return xmlError("Feed token is invalid or revoked.", 403);
  }

  const jobs = await listPublicFeedJobs(companyId);

  const items = jobs
    .map(
      (job) => `    <item>
      <title>${escapeXml(job.title)}</title>
      <company>${escapeXml(job.companyName)}</company>
      ${job.location ? `<location>${escapeXml(job.location)}</location>` : ""}
      <description>${escapeXml(job.description)}</description>
      <url>${escapeXml(job.applyUrl)}</url>
      <reference>${escapeXml(job.externalRef)}</reference>
      <datePosted>${job.datePosted.toISOString()}</datePosted>${
        job.validThrough
          ? `\n      <validThrough>${job.validThrough.toISOString()}</validThrough>`
          : ""
      }
    </item>`,
    )
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<!-- HireIQ public job feed · canonicalFeedVersion=${CANONICAL_FEED_VERSION} -->
<rss version="2.0">
  <channel>
    <title>HireIQ Jobs</title>
    <link>${escapeXml(url.origin)}</link>
    <description>Open roles published via HireIQ.</description>
${items}
  </channel>
</rss>
`;

  const etag = feedETag(body);
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag },
    });
  }

  return xml(body, 200, { ETag: etag });
}
