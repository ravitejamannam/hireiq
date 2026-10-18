import { deniesCrossCompany, requireUser } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import {
  askPastApplicantsToOptIn,
  hideRediscoveredCandidate,
  inviteRediscoveredCandidate,
  runTalentRediscovery,
  shortlistRediscoveredCandidate,
} from "@/lib/talent/rediscovery-service";

type RouteProps = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteProps) {
  const user = await requireUser();
  if (user.role !== "ADMIN") return new Response("Admins only.", { status: 403 });
  const { id } = await params;
  const jobId = Number(id);
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { companyId: true } });
  if (!job || deniesCrossCompany(user, job.companyId)) return new Response("Not found.", { status: 404 });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const candidateId = Number(form.get("candidateId"));
  if (intent === "search") await runTalentRediscovery({ jobId });
  if (intent === "ask-opt-in") {
    if (job) await askPastApplicantsToOptIn({ companyId: job.companyId, actorUserId: user.id, origin: new URL(request.url).origin });
  }
  if (intent === "hide") await hideRediscoveredCandidate({ jobId, candidateId, actorUserId: user.id });
  if (intent === "shortlist") await shortlistRediscoveredCandidate({ jobId, candidateId, actorUserId: user.id });
  if (intent === "invite") {
    await inviteRediscoveredCandidate({
      jobId,
      candidateId,
      actorUserId: user.id,
      origin: new URL(request.url).origin,
    });
  }
  return Response.redirect(new URL(`/dashboard/jobs/${jobId}/review?tab=past`, request.url), 303);
}
