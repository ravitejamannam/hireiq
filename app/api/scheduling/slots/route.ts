import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/authorization";
import { SchedulingError } from "@/lib/interviews/scheduling-service";
import {
  createSlotsForJobForAdmin,
  mintBookingInviteForApplication,
} from "@/lib/interviews/scheduling-service";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

function schedulingErrorMessage(error: unknown): { message: string; status: number } {
  if (!(error instanceof SchedulingError)) {
    return { message: "Scheduling request failed.", status: 500 };
  }
  switch (error.code) {
    case "INTERVIEWER_NOT_ASSIGNED":
      return { message: error.message, status: 400 };
    case "SLOT_START_INVALID":
      return { message: "Slots must be in the future.", status: 400 };
    case "DURATION_INVALID":
      return { message: "Slot duration must be 15-240 minutes.", status: 400 };
    case "NO_ASSIGNED_INTERVIEWER":
      return { message: "Assign an interviewer to this application's job first.", status: 400 };
    default:
      return { message: "Scheduling request failed.", status: 400 };
  }
}

/** POST /api/scheduling/slots — ADMIN: publish open slots for a job. */
export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  }

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const result = await createSlotsForJobForAdmin({
      jobId: body?.jobId,
      interviewerId: body?.interviewerId,
      interviewType: body?.interviewType,
      slots: body?.slots,
    });
    return NextResponse.json({ ok: true, created: result.created }, { headers: NO_STORE });
  } catch (error) {
    console.error("[scheduling] slot publish failed", error);
    const { message, status } = schedulingErrorMessage(error);
    return NextResponse.json({ ok: false, error: message }, { status, headers: NO_STORE });
  }
}

/** PUT /api/scheduling/slots — ADMIN: mint a booking invite for an application. */
export async function PUT(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401, headers: NO_STORE });
  }

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const result = await mintBookingInviteForApplication({
      actorIsAdminVerified: true,
      applicationId: body?.applicationId,
    });
    return NextResponse.json(
      { ok: true, bookingUrl: result.bookingUrl, expiresAt: result.expiresAt },
      { headers: NO_STORE },
    );
  } catch (error) {
    const { message, status } = schedulingErrorMessage(error);
    return NextResponse.json({ ok: false, error: message }, { status, headers: NO_STORE });
  }
}
