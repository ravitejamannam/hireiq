import { OrganizationMemberRole, PortalRole } from "@prisma/client";

export type ClientOnboardingState =
  | "EMAIL_UNVERIFIED"
  | "EMAIL_VERIFIED_NO_TENANT"
  | "MEMBER"
  | "OWNER";

export type PostAuthActor = {
  role: PortalRole;
  emailVerifiedAt: Date | null;
  companyId: number | null;
  membershipRole: OrganizationMemberRole | null;
};

export function resolveClientOnboardingState(
  actor: PostAuthActor,
): ClientOnboardingState | null {
  if (actor.role !== PortalRole.CLIENT) {
    return null;
  }

  if (actor.emailVerifiedAt === null) {
    return "EMAIL_UNVERIFIED";
  }

  if (actor.companyId === null || actor.membershipRole === null) {
    return "EMAIL_VERIFIED_NO_TENANT";
  }

  if (actor.membershipRole === OrganizationMemberRole.OWNER) {
    return "OWNER";
  }

  return "MEMBER";
}

export function pathForClientOnboardingState(state: ClientOnboardingState) {
  if (state === "EMAIL_UNVERIFIED") {
    return "/verify-email";
  }

  if (state === "EMAIL_VERIFIED_NO_TENANT") {
    return "/onboarding";
  }

  return "/client";
}

export function postAuthPathForActor(actor: PostAuthActor) {
  if (actor.role === PortalRole.ADMIN) {
    return "/dashboard";
  }

  if (actor.role === PortalRole.INTERVIEWER) {
    return "/interviewer";
  }

  const state = resolveClientOnboardingState(actor);
  if (!state) {
    return "/login";
  }

  return pathForClientOnboardingState(state);
}

/**
 * JWT/edge-safe default for CLIENT. Server pages then refine from DB.
 * Never put companyId on the JWT to make this more precise.
 */
export function clientPostAuthPath() {
  return "/post-auth";
}
