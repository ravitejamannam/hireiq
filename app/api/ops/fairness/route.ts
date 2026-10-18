import { NextResponse } from "next/server";

import { bearerCronSecretMatches } from "@/lib/auth/cron-auth";
import { recordCompanyFairness } from "@/lib/fairness/monitor";
import { reportError } from "@/lib/obs/report-error";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(request: Request) {
  if (!bearerCronSecretMatches(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized. Configure CRON_SECRET." }, { status: 401 });
  }
  try {
    const companies = await prisma.company.findMany({ select: { id: true }, take: 50 });
    let recorded = 0;
    for (const company of companies) {
      await recordCompanyFairness(company.id);
      recorded += 1;
    }
    return NextResponse.json({ ok: true, recorded });
  } catch (error) {
    reportError("fairness", error);
    return NextResponse.json({ ok: false, error: "Fairness sweep failed." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
