import { hashSecureToken } from "@/lib/auth/secure-token";
import { prisma } from "@/lib/prisma";

type RouteProps = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: RouteProps) {
  const { token } = await params;
  const tokenHash = hashSecureToken(token);
  const invite = await prisma.generatedAssessmentInvite.findFirst({
    where: { OR: [{ tokenHash }, { handoffTokenHash: tokenHash }], submittedAt: null },
  });
  if (!invite) return new Response("This assessment link is closed.", { status: 404 });
  await prisma.generatedAssessmentInvite.update({
    where: { id: invite.id },
    data: { extraTimeRequested: true },
  });
  return Response.redirect(new URL(`/assess/${token}`, request.url), 303);
}
