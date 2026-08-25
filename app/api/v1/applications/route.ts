import { NextResponse } from "next/server";

import { resolveCompanyFromApiKey } from "@/lib/api/api-keys";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/v1/applications — public API v0 (T112 expansion).
 *
 * Bearer API key required. Returns applications for a specific job
 * (or all jobs when no jobId filter is provided), with pipeline status,
 * candidate name, assessment score, and applied date. No evidence text,
 * recruiter notes, or internal metadata is exposed.
 */
const STAGE_LABELS: Record<string, string> = {
  CV_POOL: "Application received",
  EXPERT_REVIEW: "Under review",
  TECH_EVALUATION: "Technical evaluation",
  SHORTLISTED: "Shortlisted",
  SELECTED: "Selected by client",
  HIRED: "Hired",
  REJECTED: "Not progressing",
};

export async function GET(request: Request) {
  let companyId: number | null;
  try {
    companyId = await resolveCompanyFromApiKey(request.headers.get("authorization"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("SECRET_UNCONFIGURED")) {
      return NextResponse.json(
        { ok: false, error: "API keys are not configured on this deployment." },
        { status: 503, headers: NO_STORE },
      );
    }
    throw error;
  }
  if (!companyId) {
    return NextResponse.json(
      { ok: false, error: "Invalid or revoked API key." },
      { status: 401, headers: NO_STORE },
    );
  }

  const url = new URL(request.url);
  const jobIdParam = url.searchParams.get("jobId");
  const jobId = jobIdParam && /^\d+$/.test(jobIdParam) ? Number.parseInt(jobIdParam, 10) : undefined;

  const where: Record<string, unknown> = {
    companyId,
    status: { not: "REJECTED" },
  };
  if (jobId !== undefined) where.jobId = jobId;

  const apps = await prisma.application.findMany({
    where,
    select: {
      id: true,
      status: true,
      createdAt: true,
      job: { select: { id: true, title: true } },
      candidate: { select: { name: true } },
      assessmentInvite: {
        select: {
          attempt: {
            select: { score: true, maxScore: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(
    {
      ok: true,
      count: apps.length,
      applications: apps.map((a) => ({
        applicationId: a.id,
        candidateName: a.candidate.name,
        jobTitle: a.job.title,
        jobId: a.job.id,
        stage: STAGE_LABELS[a.status as string] ?? a.status,
        appliedAt: a.createdAt.toISOString(),
        assessmentScore:
          a.assessmentInvite?.attempt?.score !== undefined &&
          a.assessmentInvite?.attempt?.maxScore !== undefined
            ? `${a.assessmentInvite.attempt.score}/${a.assessmentInvite.attempt.maxScore}`
            : null,
      })),
    },
    { headers: NO_STORE },
  );
}
