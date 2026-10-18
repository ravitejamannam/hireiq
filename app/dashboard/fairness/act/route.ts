import { deniesCrossCompany, requireUser } from "@/lib/auth/authorization";
import { reviewFlaggedRequirement } from "@/lib/fairness/monitor";

export async function POST(request: Request) {
  const user = await requireUser();
  if (user.role !== "ADMIN") return new Response("Admins only.", { status: 403 });
  const form = await request.formData();
  const companyId = Number(form.get("companyId"));
  if (deniesCrossCompany(user, companyId)) return new Response("Not found.", { status: 404 });
  await reviewFlaggedRequirement({
    companyId,
    jobId: Number(form.get("jobId")),
    requirementKey: String(form.get("requirementKey") ?? ""),
    reason: String(form.get("reason") ?? ""),
    actorUserId: user.id,
  });
  return Response.redirect(new URL("/dashboard/fairness", request.url), 303);
}
