import { prisma } from "@/lib/prisma";
import {
  createDraftSpecificationForJob,
  specFieldsFromRecord,
} from "@/lib/jobs/job-specification";
import { WORKFLOW_OWNED_TIMESTAMP_FIELDS } from "@/lib/validation/job-validation";
import { OrganizationMembershipError } from "@/lib/validation/organization-membership-validation";

export async function createClientRequirementDraftForCompany(input: {
  companyId: number;
  title: unknown;
}) {
  if (typeof input.title !== "string" || !input.title.trim()) {
    throw new OrganizationMembershipError("Role title is required.");
  }

  const title = input.title.trim();

  return prisma.$transaction(async (tx) => {
    const job = await tx.job.create({
      data: {
        title,
        status: "OPEN",
        companyId: input.companyId,
        requirementLifecycle: "REQUIREMENT_DRAFTED",
      },
    });

    for (const field of WORKFLOW_OWNED_TIMESTAMP_FIELDS) {
      if (job[field] !== null) {
        throw new OrganizationMembershipError(
          "Draft requirement cannot plant workflow timestamps.",
        );
      }
    }

    await createDraftSpecificationForJob({
      jobId: job.id,
      fields: specFieldsFromRecord(job),
      db: tx,
    });

    return {
      id: job.id,
      companyId: job.companyId,
      requirementLifecycle: job.requirementLifecycle,
      clientCompletedAt: job.clientCompletedAt,
      sourcingAccessReceivedAt: job.sourcingAccessReceivedAt,
      shortlistingDueAt: job.shortlistingDueAt,
      shortlistingCompletedAt: job.shortlistingCompletedAt,
    };
  });
}
