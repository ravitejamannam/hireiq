import { NextResponse } from "next/server";

import { requireCompanyFromApiRequest } from "@/lib/api/require-company-from-request";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET /api/v1/candidates — public API v0 (T112 expansion).
 *
 * Bearer API key required. Returns candidate records scoped to the
 * API key's company: name, role, skills, experience, location,
 * pipeline status, and assessment scores.
 */
export async function GET(request: Request) {
  const auth = await requireCompanyFromApiRequest(request);
  if (!auth.ok) return auth.response;
  const { companyId } = auth;

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";

  const where: Record<string, unknown> = { companyId };
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { skills: { contains: search, mode: "insensitive" } },
    ];
  }

  const candidates = await prisma.candidate.findMany({
    where,
    select: {
      id: true,
      name: true,
      role: true,
      experienceYears: true,
      location: true,
      skills: true,
      currentEmployer: true,
      expectedCTC: true,
      status: true,
      createdAt: true,
      applications: {
        select: {
          id: true,
          status: true,
          job: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(
    {
      ok: true,
      count: candidates.length,
      candidates: candidates.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        currentEmployer: c.currentEmployer,
        skills: c.skills?.split(",").map((s) => s.trim()).filter(Boolean),
        experienceYears: c.experienceYears,
        location: c.location,
        expectedCTC: c.expectedCTC,
        status: c.status,
        latestApplication: c.applications[0]
          ? {
              id: c.applications[0].id,
              status: c.applications[0].status,
              jobTitle: c.applications[0].job.title,
            }
          : null,
        addedOn: c.createdAt.toISOString(),
      })),
    },
    { headers: NO_STORE },
  );
}
