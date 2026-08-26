import { NextResponse } from "next/server";

import { resolveCompanyFromApiKey } from "@/lib/api/api-keys";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/v1/candidates/[id] — public API v0 detail view.
 *
 * Bearer key required. Returns one candidate scoped to the API key's
 * company, including applications, evidence summary, and latest
 * assessment score. Cross-tenant access returns 404 (not 403) to
 * avoid leaking existence.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let companyId: number | null;
  try {
    companyId = await resolveCompanyFromApiKey(request.headers.get("authorization"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("SECRET_UNCONFIGURED")) {
      return NextResponse.json({ ok: false, error: "API keys not configured." }, { status: 503, headers: NO_STORE });
    }
    throw error;
  }
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Invalid or revoked API key." }, { status: 401, headers: NO_STORE });
  }

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid id." }, { status: 400, headers: NO_STORE });
  }

  const candidate = await prisma.candidate.findFirst({
    where: { id: Number.parseInt(id, 10), companyId },
    select: {
      id: true,
      name: true,
      role: true,
      currentEmployer: true,
      skills: true,
      experienceYears: true,
      location: true,
      expectedCTC: true,
      status: true,
      createdAt: true,
      applications: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          source: true,
          expertScore: true,
          createdAt: true,
          job: { select: { id: true, title: true } },
        },
      },
    },
  });

  if (!candidate) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404, headers: NO_STORE });
  }

  return NextResponse.json(
    {
      ok: true,
      candidate: {
        ...candidate,
        skills: candidate.skills?.split(",").map((s) => s.trim()).filter(Boolean),
        applications: candidate.applications.map((a) => ({
          id: a.id,
          status: a.status,
          source: a.source,
          expertScore: a.expertScore,
          appliedOn: a.createdAt.toISOString(),
          jobId: a.job.id,
          jobTitle: a.job.title,
        })),
        addedOn: candidate.createdAt.toISOString(),
        createdAt: undefined,
      },
    },
    { headers: NO_STORE },
  );
}
