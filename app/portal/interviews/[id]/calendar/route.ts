import { cookies } from "next/headers";

import { icsEvent } from "@/lib/portal/candidate-portal";
import { applicationsForEmail } from "@/lib/portal/portal-service";
import { PORTAL_COOKIE, readPortalSession } from "@/lib/portal/portal-session";

type RouteProps = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteProps) {
  const session = readPortalSession((await cookies()).get(PORTAL_COOKIE)?.value);
  if (!session) return new Response("Sign in required.", { status: 401 });
  const { id } = await params;
  const interviewId = Number(id);
  const rows = await applicationsForEmail(session.email);
  const interview = rows.flatMap((row) => row.interviews).find((item) => item.id === interviewId);
  if (!interview) return new Response("Not found.", { status: 404 });
  const job = rows.find((row) => row.interviews.some((item) => item.id === interviewId));
  const body = icsEvent({
    uid: `interview-${interview.id}@hireiq`,
    title: `${interview.type} — ${job?.job.title ?? "Interview"}`,
    start: interview.interviewAt,
    end: new Date(interview.interviewAt.getTime() + 60 * 60 * 1000),
    meetUrl: interview.meetUrl,
  });
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename=interview-${interview.id}.ics`,
    },
  });
}
