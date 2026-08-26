import { NextResponse } from "next/server";

import { resolveCompanyFromApiKey } from "@/lib/api/api-keys";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/v1/sourced-candidates — machine ingestion for sourced
 * candidates (Chrome extension, enrichment pipelines).
 *
 * Bearer API key required. Mirrors the admin sourced-intake rules:
 * candidate matched by name within the company, application upserted
 * per (candidateId, jobId). Only LINKEDIN|NAUKRI sources accepted —
 * the same enum as the UI path.
 */
export async function POST(request: Request) {
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

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "JSON body required." }, { status: 400, headers: NO_STORE });
  }

  const jobId = Number(body.jobId);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const source = body.source;

  if (!Number.isInteger(jobId) || jobId <= 0) {
    return NextResponse.json({ ok: false, error: "jobId is required." }, { status: 400, headers: NO_STORE });
  }
  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ ok: false, error: "name must be 2-120 characters." }, { status: 400, headers: NO_STORE });
  }
  if (source !== "LINKEDIN" && source !== "NAUKRI") {
    return NextResponse.json({ ok: false, error: "source must be LINKEDIN or NAUKRI." }, { status: 400, headers: NO_STORE });
  }

  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId },
    select: { id: true, companyId: true, title: true },
  });
  if (!job) {
    return NextResponse.json({ ok: false, error: "Job not found in this workspace." }, { status: 404, headers: NO_STORE });
  }

  const experienceYears =
    Number.isFinite(Number(body.experienceYears)) && Number(body.experienceYears) >= 0
      ? Math.floor(Number(body.experienceYears))
      : 0;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.candidate.findFirst({
        where: { companyId: job.companyId, name },
        select: { id: true },
      });

      const candidate =
        existing ??
        (await tx.candidate.create({
          data: {
            name,
            role: job.title,
            experienceYears,
            location: typeof body.location === "string" ? body.location.trim() || null : null,
            currentEmployer:
              typeof body.currentEmployer === "string" ? body.currentEmployer.trim() || null : null,
            skills: typeof body.skills === "string" ? body.skills.trim() || null : null,
            status: "APPLIED",
            companyId: job.companyId,
          },
          select: { id: true },
        }));

      const application = await tx.application.upsert({
        where: { candidateId_jobId: { candidateId: candidate.id, jobId: job.id } },
        create: {
          candidateId: candidate.id,
          jobId: job.id,
          companyId: job.companyId,
          status: "CV_POOL",
          source,
        },
        update: { source },
        select: { id: true },
      });

      return { applicationId: application.id, candidateId: candidate.id, reusedCandidate: Boolean(existing) };
    });

    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    console.error("[api-sourced-candidates] failed", error);
    return NextResponse.json({ ok: false, error: "Could not add candidate." }, { status: 500, headers: NO_STORE });
  }
}
