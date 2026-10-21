import { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { prisma } from "@/lib/prisma";
import { parseScreeningPolicyInput, policyFromRow, type ScreeningPolicy } from "@/lib/screening/screening-policy";

const policySelect = {
  id: true,
  version: true,
  basicWeight: true,
  practicalWeight: true,
  evidenceWeight: true,
  basicPassPercent: true,
  practicalPassPercent: true,
  borderlineBandPercent: true,
  reviewCapacity: true,
  practicalTitle: true,
  practicalInstructions: true,
  practicalEstimatedMinutes: true,
  practicalAllowedResources: true,
  practicalDeadlineDays: true,
  practicalCompensationNote: true,
  practicalRubric: true,
} satisfies Prisma.JobScreeningPolicySelect;

export async function getCurrentScreeningPolicy(jobId: number, companyId: number): Promise<ScreeningPolicy> {
  const row = await prisma.jobScreeningPolicy.findFirst({
    where: { jobId, companyId },
    orderBy: { version: "desc" },
    select: policySelect,
  });
  return policyFromRow(row);
}

export async function listScreeningPolicyVersions(jobId: number, companyId: number) {
  return prisma.jobScreeningPolicy.findMany({
    where: { jobId, companyId },
    orderBy: { version: "desc" },
    take: 20,
    select: {
      id: true,
      version: true,
      basicWeight: true,
      practicalWeight: true,
      evidenceWeight: true,
      basicPassPercent: true,
      practicalPassPercent: true,
      reviewCapacity: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });
}

/**
 * Saves a new version. Old versions are never edited, so a score always
 * points at the exact weights and rubric it was produced under.
 */
export async function saveScreeningPolicy(input: { jobId: number; companyId: number; actorUserId: number; values: unknown }) {
  const parsed = parseScreeningPolicyInput(input.values);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "The screening settings are not valid." };
  }
  const job = await prisma.job.findFirst({ where: { id: input.jobId, companyId: input.companyId }, select: { id: true } });
  if (!job) return { ok: false as const, error: "Job not found." };
  try {
    const created = await prisma.$transaction(async (tx) => {
      const latest = await tx.jobScreeningPolicy.findFirst({
        where: { jobId: job.id },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const row = await tx.jobScreeningPolicy.create({
        data: {
          ...parsed.data,
          practicalRubric: parsed.data.practicalRubric as unknown as Prisma.InputJsonValue,
          companyId: input.companyId,
          jobId: job.id,
          version: (latest?.version ?? 0) + 1,
          createdByUserId: input.actorUserId,
        },
        select: { id: true, version: true },
      });
      await writeAuditLog(tx, {
        actorUserId: input.actorUserId,
        actorRole: "ADMIN",
        companyId: input.companyId,
        action: "SCREENING_POLICY_SAVED",
        targetType: "JOB",
        targetId: job.id,
        reason: `v${row.version}: weights ${parsed.data.basicWeight}/${parsed.data.practicalWeight}/${parsed.data.evidenceWeight}, pass ${parsed.data.basicPassPercent ?? "-"}/${parsed.data.practicalPassPercent ?? "-"}, capacity ${parsed.data.reviewCapacity}`,
      });
      return row;
    });
    return { ok: true as const, id: created.id, version: created.version };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false as const, error: "Someone else saved these settings at the same time. Reload and try again." };
    }
    throw error;
  }
}
