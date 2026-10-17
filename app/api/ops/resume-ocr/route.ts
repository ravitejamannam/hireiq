import { NextResponse } from "next/server";

import { bearerCronSecretMatches } from "@/lib/auth/cron-auth";
import { reportError } from "@/lib/obs/report-error";
import { processPendingResumeOcr } from "@/lib/resumes/ocr-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * GET/POST /api/ops/resume-ocr
 * Vercel Cron calls this about every five minutes on Pro. GitHub Actions
 * is the backup and often starts late. Do not run both on Pro: disable
 * .github/workflows/resume-ocr.yml after upgrading, or scans are claimed
 * twice as often.
 * Authorize with `Authorization: Bearer $CRON_SECRET`.
 * Each row is claimed before OCR, and a file stops after 3 attempts.
 */
async function run(request: Request) {
  if (!bearerCronSecretMatches(request.headers.get("authorization"))) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized. Configure CRON_SECRET." },
      { status: 401, headers: NO_STORE },
    );
  }
  try {
    const result = await processPendingResumeOcr({ deadlineAt: Date.now() + 45_000 });
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    reportError("resume-ocr-cron", error);
    return NextResponse.json(
      { ok: false, error: "Resume OCR sweep failed." },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
