import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { loadPortalApplication } from "@/lib/portal/portal-service";
import { PORTAL_COOKIE, readPortalSession } from "@/lib/portal/portal-session";

type RouteProps = { params: Promise<{ id: string }> };

function validZone(value: unknown) {
  if (typeof value !== "string" || value.length > 80) return null;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

export async function POST(request: Request, { params }: RouteProps) {
  const session = readPortalSession((await cookies()).get(PORTAL_COOKIE)?.value);
  if (!session) return new Response(null, { status: 401 });
  const zone = validZone((await request.json().catch(() => null) as { timeZone?: unknown } | null)?.timeZone);
  if (!zone) return new Response(null, { status: 400 });
  const { id } = await params;
  const application = await loadPortalApplication(session.email, Number(id));
  if (!application) return new Response(null, { status: 404 });
  await prisma.application.update({ where: { id: application.id }, data: { candidateTimeZone: zone } });
  return new Response(null, { status: 204 });
}
