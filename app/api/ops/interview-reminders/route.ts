import { NextResponse } from "next/server";

import { bearerCronSecretMatches } from "@/lib/auth/cron-auth";
import { sendDueInterviewReminders } from "@/lib/interviews/interview-reminders";
import { reportError } from "@/lib/obs/report-error";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(request: Request) {
  if (!bearerCronSecretMatches(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Unauthorized. Configure CRON_SECRET." }, { status: 401 });
  }
  try {
    const result = await sendDueInterviewReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    reportError("interview-reminders", error);
    return NextResponse.json({ ok: false, error: "Interview reminder sweep failed." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
