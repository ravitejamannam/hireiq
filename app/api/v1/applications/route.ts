import { NextResponse } from "next/server";

import { requireCompanyFromApiRequest } from "@/lib/api/require-company-from-request";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireCompanyFromApiRequest(request);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const jobId = Number(url.searchParams.get("jobId") ?? "");
  const applications = await prisma.application.findMany({
    where: {
      companyId: auth.companyId,
      ...(Number.isInteger(jobId) && jobId > 0 ? { jobId } : {}),
    },
    orderBy: { id: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      createdAt: true,
      jobId: true,
      candidate: { select: { name: true } },
      ingestionEvents: { take: 1, orderBy: { id: "desc" }, select: { sourceChannel: true } },
    },
  });
  return NextResponse.json({
    ok: true,
    count: applications.length,
    applications: applications.map((row) => ({
      id: row.id,
      jobId: row.jobId,
      name: row.candidate.name,
      status: row.status,
      source: row.ingestionEvents[0]?.sourceChannel ?? null,
      appliedAt: row.createdAt.toISOString(),
    })),
  });
}
