import { cookies } from "next/headers";

import { deleteSelfIdentification, saveSelfIdentification, SelfIdentificationError } from "@/lib/fairness/self-id";
import { applicationsForEmail } from "@/lib/portal/portal-service";
import { PORTAL_COOKIE, readPortalSession } from "@/lib/portal/portal-session";

export async function POST(request: Request) {
  const session = readPortalSession((await cookies()).get(PORTAL_COOKIE)?.value);
  if (!session) return Response.redirect(new URL("/portal", request.url), 303);
  const applications = await applicationsForEmail(session.email);
  const application = applications[0];
  if (!application) return Response.redirect(new URL("/portal/home", request.url), 303);
  const form = await request.formData();
  if (String(form.get("intent")) === "delete") {
    await deleteSelfIdentification(application.candidateId);
  } else {
    try {
      await saveSelfIdentification({
        candidateId: application.candidateId,
        companyId: application.companyId,
        gender: String(form.get("gender") ?? ""),
        ageBand: String(form.get("ageBand") ?? ""),
        disability: String(form.get("disability") ?? ""),
        region: String(form.get("region") ?? ""),
      });
    } catch (error) {
      if (!(error instanceof SelfIdentificationError)) throw error;
      return Response.redirect(new URL("/portal/home", request.url), 303);
    }
  }
  return Response.redirect(new URL(`/portal/applications/${application.id}?selfid=1`, request.url), 303);
}
