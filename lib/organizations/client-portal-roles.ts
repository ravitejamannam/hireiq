import type { OrganizationMemberRole } from "@prisma/client";

/**
 * Client-portal seats. Owner and member keep their existing access.
 * HR Head only collects the basic requirement. Recruiter takes that
 * requirement through analysis, job-portal posting, and the candidate database.
 * Invitations can create member, HR Head, or recruiter — never an owner.
 */

export const CLIENT_MEMBERSHIP_ROLES = [
  "OWNER",
  "MEMBER",
  "HR_HEAD",
  "RECRUITER",
] as const satisfies readonly OrganizationMemberRole[];

export type ClientMembershipRole = (typeof CLIENT_MEMBERSHIP_ROLES)[number];

export const TEAM_ROLE_ORDER = [
  "OWNER",
  "HR_HEAD",
  "RECRUITER",
  "MEMBER",
] as const satisfies readonly ClientMembershipRole[];

const INVITABLE_ROLES = new Set<ClientMembershipRole>([
  "MEMBER",
  "HR_HEAD",
  "RECRUITER",
]);

export type DistributionAccess = "none" | "prepare" | "publish" | "manage";
export type RequirementIntake = "basic" | "full";
export type HireConfirmationMode = "always" | "company-setting" | "never";

export type ClientPortalAccess = {
  role: ClientMembershipRole;
  label: string;
  summary: string;
  work: string;
  manageTeam: boolean;
  viewBilling: boolean;
  analyzeRequirements: boolean;
  showCandidates: boolean;
  decideHiring: boolean;
  requirementIntake: RequirementIntake;
  distribution: DistributionAccess;
  hireConfirmation: HireConfirmationMode;
};

const ACCESS: Record<ClientMembershipRole, ClientPortalAccess> = {
  OWNER: {
    role: "OWNER",
    label: "Owner",
    summary: "Runs the company account, team, billing, and hiring decisions.",
    work: "You can manage the team, billing, requirements, job portals, and hire decisions.",
    manageTeam: true,
    viewBilling: true,
    analyzeRequirements: true,
    showCandidates: true,
    decideHiring: true,
    requirementIntake: "full",
    distribution: "manage",
    hireConfirmation: "always",
  },
  MEMBER: {
    role: "MEMBER",
    label: "Member",
    summary: "Works across requirements, candidates, and hiring with the owner.",
    work: "You can work requirements and candidates. Hiring decisions follow the company setting.",
    manageTeam: false,
    viewBilling: true,
    analyzeRequirements: true,
    showCandidates: true,
    decideHiring: true,
    requirementIntake: "full",
    distribution: "prepare",
    hireConfirmation: "company-setting",
  },
  HR_HEAD: {
    role: "HR_HEAD",
    label: "HR Head",
    summary: "Collects basic requirements from the client.",
    work: "Collect the basic requirement from the client: title, location, experience, headcount, and must-haves. The recruiter completes analysis, job-portal posting, and the candidate database.",
    manageTeam: false,
    viewBilling: false,
    analyzeRequirements: false,
    showCandidates: false,
    decideHiring: false,
    requirementIntake: "basic",
    distribution: "none",
    hireConfirmation: "never",
  },
  RECRUITER: {
    role: "RECRUITER",
    label: "Recruiter",
    summary:
      "Collects the requirement and analysis, posts it on job portals, and collects the candidate database.",
    work: "Collect the requirement and the analysis, post the role on job portals, then collect the candidate database.",
    manageTeam: false,
    viewBilling: false,
    analyzeRequirements: true,
    showCandidates: true,
    decideHiring: false,
    requirementIntake: "full",
    distribution: "publish",
    hireConfirmation: "never",
  },
};

const LOCKED: ClientPortalAccess = {
  role: "MEMBER",
  label: "Member",
  summary: "This seat cannot use the client portal.",
  work: "Ask the company owner to confirm your role.",
  manageTeam: false,
  viewBilling: false,
  analyzeRequirements: false,
  showCandidates: false,
  decideHiring: false,
  requirementIntake: "basic",
  distribution: "none",
  hireConfirmation: "never",
};

export function isClientMembershipRole(
  role: unknown,
): role is ClientMembershipRole {
  return (
    role === "OWNER" ||
    role === "MEMBER" ||
    role === "HR_HEAD" ||
    role === "RECRUITER"
  );
}

export function isInvitableClientRole(
  role: unknown,
): role is Exclude<ClientMembershipRole, "OWNER"> {
  return isClientMembershipRole(role) && INVITABLE_ROLES.has(role);
}

export function clientPortalAccess(role: OrganizationMemberRole | null | undefined) {
  if (!isClientMembershipRole(role)) {
    return LOCKED;
  }
  return ACCESS[role];
}

export function clientRoleLabel(role: OrganizationMemberRole | string | null | undefined) {
  return clientPortalAccess(isClientMembershipRole(role) ? role : null).label;
}

export function clientRoleSummary(role: OrganizationMemberRole | string | null | undefined) {
  return clientPortalAccess(isClientMembershipRole(role) ? role : null).summary;
}

export const INVITE_ROLE_OPTIONS = (["HR_HEAD", "RECRUITER", "MEMBER"] as const).map(
  (role) => ({
    role,
    label: ACCESS[role].label,
    summary: ACCESS[role].summary,
  }),
);

export function canPrepareJobDistribution(role: OrganizationMemberRole | null) {
  if (!isClientMembershipRole(role)) return false;
  return clientPortalAccess(role).distribution !== "none";
}

export function canPublishJobDistribution(role: OrganizationMemberRole | null) {
  if (!isClientMembershipRole(role)) return false;
  const distribution = clientPortalAccess(role).distribution;
  return distribution === "publish" || distribution === "manage";
}

export function canManageProviderConnections(role: OrganizationMemberRole | null) {
  if (role === null) return false;
  return clientPortalAccess(role).distribution === "manage";
}

export type ClientCapability =
  | "manageTeam"
  | "viewBilling"
  | "analyzeRequirements"
  | "showCandidates"
  | "decideHiring"
  | "prepareDistribution"
  | "publishDistribution"
  | "manageProviderConnections";

/** Server-side capability check. A null or unknown role is denied. */
export function clientCapabilityAllowed(
  role: OrganizationMemberRole | null | undefined,
  capability: ClientCapability,
) {
  if (!isClientMembershipRole(role)) return false;
  const access = clientPortalAccess(role);
  switch (capability) {
    case "manageTeam":
      return access.manageTeam;
    case "viewBilling":
      return access.viewBilling;
    case "analyzeRequirements":
      return access.analyzeRequirements;
    case "showCandidates":
      return access.showCandidates;
    case "decideHiring":
      return access.decideHiring;
    case "prepareDistribution":
      return access.distribution !== "none";
    case "publishDistribution":
      return access.distribution === "publish" || access.distribution === "manage";
    case "manageProviderConnections":
      return access.distribution === "manage";
    default: {
      const unexpected: never = capability;
      return unexpected;
    }
  }
}

/** Ownership can move only onto an existing Member. HR Head and Recruiter are not promotion targets. */
export function ownershipTransferTargetAllowed(role: OrganizationMemberRole) {
  return role === "MEMBER";
}

const ANALYSIS_FIELD_KEYS = [
  "niceToHaveRequirements",
  "jobDescription",
  "evaluationCriteria",
  "primarySkills",
  "responsibilities",
  "benefits",
  "aboutCompany",
] as const;

export function scopeClientRequirementFields<T extends object>(
  role: OrganizationMemberRole,
  fields: T,
): T {
  if (clientPortalAccess(role).requirementIntake !== "basic") {
    return fields;
  }

  const scoped: Record<string, unknown> = {
    ...(fields as Record<string, unknown>),
  };
  for (const key of ANALYSIS_FIELD_KEYS) {
    delete scoped[key];
  }
  return scoped as T;
}
