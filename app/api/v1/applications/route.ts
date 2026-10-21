import { NextResponse } from "next/server";

import { toPublicApplication } from "@/lib/api/public-application";
import { requireCompanyFromApiRequest } from "@/lib/api/require-company-from-request";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Company API-key list. `source` is unchanged. `intakeMethod` is additive.
 * Missing or unrecognised intake is "Not Recorded". The response does not
 * include externalApplicationId or other ingestion metadata.
 */
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
      ingestionEvents: {
        select: {
          id: true,
          receivedAt: true,
          status: true,
          sourceChannel: true,
          externalApplicationId: true,
        },
      },
    },
  });
  return NextResponse.json({
    ok: true,
    count: applications.length,
    applications: applications.map((row) =>
      toPublicApplication({
        id: row.id,
        jobId: row.jobId,
        name: row.candidate.name,
        status: row.status,
        createdAt: row.createdAt,
        ingestionEvents: row.ingestionEvents,
      }),
    ),
  });
}
