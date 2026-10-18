export const AZ_CLIENT_MEMBERSHIP_ROLE = "MEMBER" as const;

export type PortalClientRow = {
  role: string;
  disabledAt: Date | null;
  emailVerifiedAt: Date | null;
  companyId: number | null;
  activeMembershipCompanyIds: readonly number[];
};

export type PortalInterviewerRow = {
  role: string;
  disabledAt: Date | null;
  interviewerId: number | null;
};

export function clientFixtureIsReady(row: PortalClientRow, companyId: number): boolean {
  return (
    row.role === "CLIENT" &&
    row.disabledAt === null &&
    row.emailVerifiedAt !== null &&
    row.companyId === companyId &&
    row.activeMembershipCompanyIds.includes(companyId)
  );
}

export function interviewerFixtureIsReady(row: PortalInterviewerRow): boolean {
  return row.role === "INTERVIEWER" && row.disabledAt === null && row.interviewerId !== null;
}
