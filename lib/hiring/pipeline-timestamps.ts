import { ApplicationPipelineStatus } from "@prisma/client";

/**
 * Stamp shortlistedAt the first time an application reaches SHORTLISTED.
 * Later transitions (select, hire, reject) must not overwrite it.
 */
export function shortlistedAtPatch(
  nextStatus: ApplicationPipelineStatus,
  existing: Date | null | undefined,
): { shortlistedAt?: Date } {
  if (nextStatus === ApplicationPipelineStatus.SHORTLISTED && !existing) {
    return { shortlistedAt: new Date() };
  }
  return {};
}
