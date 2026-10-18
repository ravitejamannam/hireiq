import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/authorization";
import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await context.params;
  const form = await request.formData();
  const stepId = Number(form.get("stepId"));
  const sequenceId = Number(id);
  const sequence = await prisma.outreachSequence.findFirst({
    where: {
      id: sequenceId,
      ...(admin.platformOperator || admin.companyId == null ? {} : { companyId: admin.companyId }),
    },
    select: { id: true, companyId: true, steps: { where: { id: stepId }, select: { id: true, approvedAt: true } } },
  });
  const step = sequence?.steps[0];
  if (!sequence || !step || step.approvedAt) redirect("/dashboard/outreach");
  await prisma.outreachStep.update({
    where: { id: step.id },
    data: { approvedAt: new Date(), approvedByUserId: admin.id },
  });
  await writeAuditLog(prisma, {
    actorUserId: admin.id,
    actorRole: admin.role,
    companyId: sequence.companyId,
    action: "OUTREACH_APPROVED",
    targetType: "OutreachStep",
    targetId: step.id,
    reason: "Recruiter approved this email before it can be sent.",
  });
  redirect("/dashboard/outreach");
}
