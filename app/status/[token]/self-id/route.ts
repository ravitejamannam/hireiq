import { createHash } from "node:crypto";

import { deleteSelfIdentification, saveSelfIdentification } from "@/lib/fairness/self-id";
import { prisma } from "@/lib/prisma";

type RouteProps = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: RouteProps) {
  const { token } = await params;
  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const application = await prisma.application.findFirst({
    where: { statusTokenHash: tokenHash },
    select: { candidateId: true, companyId: true },
  });
  if (!application) return new Response("Not found.", { status: 404 });
  const form = await request.formData();
  if (String(form.get("intent")) === "delete") await deleteSelfIdentification(application.candidateId);
  else {
    await saveSelfIdentification({
      candidateId: application.candidateId,
      companyId: application.companyId,
      gender: String(form.get("gender") ?? ""),
      ageBand: String(form.get("ageBand") ?? ""),
      disability: String(form.get("disability") ?? ""),
      region: String(form.get("region") ?? ""),
    });
  }
  return Response.redirect(new URL(`/status/${token}`, request.url), 303);
}
