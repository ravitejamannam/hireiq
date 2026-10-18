import { hashSecureToken } from "@/lib/auth/secure-token";
import { prisma } from "@/lib/prisma";

type RouteProps = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: RouteProps) {
  const zone = (await request.json().catch(() => null) as { timeZone?: unknown } | null)?.timeZone;
  if (typeof zone !== "string" || zone.length > 80) return new Response(null, { status: 400 });
  try {
    Intl.DateTimeFormat(undefined, { timeZone: zone });
  } catch {
    return new Response(null, { status: 400 });
  }
  const { token } = await params;
  const invite = await prisma.interviewBookingInvite.findUnique({
    where: { tokenHash: hashSecureToken(token) },
    select: { applicationId: true },
  });
  if (!invite) return new Response(null, { status: 404 });
  await prisma.application.update({
    where: { id: invite.applicationId },
    data: { candidateTimeZone: zone },
  });
  return new Response(null, { status: 204 });
}
