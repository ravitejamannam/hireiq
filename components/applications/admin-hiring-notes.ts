import { ApplicationPipelineStatus } from "@prisma/client";

export function getAdminHiringMonitorNote(
  status: ApplicationPipelineStatus,
): string | null {
  if (status === ApplicationPipelineStatus.SELECTED) {
    return "Awaiting client hire confirmation";
  }

  if (status === ApplicationPipelineStatus.HIRED) {
    return "Hire confirmed. Billing generated.";
  }

  if (status === ApplicationPipelineStatus.SHORTLISTED) {
    return "Interviewer recommendation. Client selects from the Client portal.";
  }

  return null;
}
