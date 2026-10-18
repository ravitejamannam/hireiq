import { deniesCrossCompany, requireUser } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { completeDeletionRequest, retainDeletionRequest } from "@/lib/privacy/deletion-queue";

export async function POST(request: Request) {
  const user = await requireUser();
  if (user.role !== "ADMIN") return new Response("Admins only.", { status: 403 });
  const form = await request.formData();
  const requestId = Number(form.get("requestId"));
  const queued = await prisma.candidateDeletionRequest.findUnique({ where: { id: requestId }, select: { companyId: true } });
  if (!queued || deniesCrossCompany(user, queued.companyId)) return new Response("Not found.", { status: 404 });
  const intent = String(form.get("intent") ?? "");
  if (intent === "complete") {
    await completeDeletionRequest({ requestId, actorUserId: user.id });
  } else if (intent === "retain") {
    await retainDeletionRequest({
      requestId,
      actorUserId: user.id,
      reason: String(form.get("reason") ?? ""),
    });
  }
  return Response.redirect(new URL("/dashboard/deletions", request.url), 303);
}
