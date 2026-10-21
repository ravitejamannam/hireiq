import { NextResponse } from "next/server";

import {
  RateLimitError,
  consumeAuthRateLimit,
  rateLimitKeyForIp,
} from "@/lib/auth/rate-limit";
import { readRequestIp } from "@/lib/auth/request-ip";

import { isAllowedApplyOrigin } from "@/lib/apply/same-origin";
import {
  bookSlotWithToken,
  SchedulingError,
} from "@/lib/interviews/scheduling-service";

export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/schedule/[token] — PUBLIC candidate booking.
 * Body: { slotId }. Single-use token; slot claimed transactionally.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    if (!isAllowedApplyOrigin(request)) {
      return NextResponse.json({ ok: false, error: "Unavailable." }, { status: 403, headers: NO_STORE });
    }

    // Audit fix: abuse guard on a public booking endpoint.
    try {
      await consumeAuthRateLimit({
        name: "scheduleBookIp",
        key: rateLimitKeyForIp(await readRequestIp()),
      });
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json({ ok: false, error: "Too many attempts." }, { status: 429, headers: NO_STORE });
      }
      throw error;
    }

    const { token } = await context.params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

    const result = await bookSlotWithToken({
      rawToken: token,
      slotId: body?.slotId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.errorCode },
        { status: result.errorCode === "SLOT_UNAVAILABLE" || result.errorCode === "SLOT_DURATION_MISMATCH" ? 409 : 404, headers: NO_STORE },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        interviewId: result.interviewId,
        scheduledAt: result.scheduledAt.toISOString(),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof SchedulingError) {
      return NextResponse.json({ ok: false, error: error.code }, { status: 400, headers: NO_STORE });
    }
    console.error("[schedule-booking] failed", error);
    return NextResponse.json({ ok: false, error: "Booking failed." }, { status: 500, headers: NO_STORE });
  }
}
