import { PortalRole, type Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { postAuthPathForActor } from "@/lib/auth/onboarding-state";
import { prisma } from "@/lib/prisma";

export class AuthenticationError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "Unauthorized.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: PortalRole;
  companyId: number | null;
  interviewerId: number | null;
};

const authUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  companyId: true,
  interviewerId: true,
  emailVerifiedAt: true,
  disabledAt: true,
} satisfies Prisma.UserSelect;

type UserAuthorizationRow = AuthUser & {
  emailVerifiedAt: Date | null;
  disabledAt: Date | null;
};

function denyResource(): never {
  throw new AuthorizationError("Resource not found.");
}

function toAuthUser(user: UserAuthorizationRow): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.companyId,
    interviewerId: user.interviewerId,
  };
}

function requireClientCompanyId(user: AuthUser): number {
  if (user.companyId === null) {
    throw new AuthorizationError("Unauthorized.");
  }
  return user.companyId;
}

export function assertClientEmailVerified(emailVerifiedAt: Date | null) {
  if (emailVerifiedAt === null) {
    throw new AuthorizationError("Unauthorized.");
  }
}

/**
 * Client companyId comes from ACTIVE OrganizationMember.
 * User.companyId is only a compatibility projection: mismatch fails closed.
 */
export async function hydrateAuthUser(
  user: UserAuthorizationRow,
): Promise<UserAuthorizationRow> {
  if (user.role !== PortalRole.CLIENT) {
    return user;
  }

  const memberships = await prisma.organizationMember.findMany({
    where: {
      userId: user.id,
      status: "ACTIVE",
    },
    select: {
      companyId: true,
    },
  });

  if (memberships.length > 1) {
    throw new AuthorizationError("Unauthorized.");
  }

  const membership = memberships[0];

  if (!membership) {
    return {
      ...user,
      companyId: null,
    };
  }

  if (user.companyId !== membership.companyId) {
    throw new AuthorizationError("Unauthorized.");
  }

  return {
    ...user,
    companyId: membership.companyId,
  };
}

async function loadSessionUser(): Promise<UserAuthorizationRow> {
  const session = await auth();
  const rawId = session?.user?.id;

  if (!rawId) {
    throw new AuthenticationError();
  }

  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AuthenticationError();
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: authUserSelect,
  });

  if (!user) {
    throw new AuthenticationError();
  }

  if (user.disabledAt) {
    throw new AuthenticationError();
  }

  return hydrateAuthUser(user);
}

function requireInterviewerProfileId(user: AuthUser): number {
  if (user.interviewerId === null) {
    throw new AuthorizationError("Unauthorized.");
  }
  return user.interviewerId;
}

/**
 * Resolve the authenticated actor from the Auth.js session,
 * then reload the authoritative User row from the database.
 * Never trusts browser-supplied role/companyId/interviewerId.
 * Client companyId is hydrated from ACTIVE OrganizationMember.
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await loadSessionUser();
  return toAuthUser(user);
}

export async function requireRole(
  ...roles: PortalRole[]
): Promise<AuthUser> {
  const user = await requireUser();

  if (!roles.includes(user.role)) {
    throw new AuthorizationError();
  }

  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  return requireRole(PortalRole.ADMIN);
}

export async function requireClient(): Promise<AuthUser> {
  const user = await loadSessionUser();

  if (user.role !== PortalRole.CLIENT) {
    throw new AuthorizationError();
  }

  assertClientEmailVerified(user.emailVerifiedAt);
  requireClientCompanyId(user);
  return toAuthUser(user);
}

export type ClientPortalContext = AuthUser & {
  companyId: number;
  membershipRole: "OWNER" | "MEMBER";
  company: {
    id: number;
    name: string;
  };
};

/**
 * Client portal authorization: PortalRole.CLIENT + emailVerifiedAt +
 * ACTIVE OrganizationMember + Company exists.
 * companyId is membership-derived, never from JWT or browser input.
 */
export async function authorizeClientPortalAccess(
  user: UserAuthorizationRow,
): Promise<ClientPortalContext> {
  if (user.role !== PortalRole.CLIENT) {
    throw new AuthorizationError();
  }

  assertClientEmailVerified(user.emailVerifiedAt);
  const companyId = requireClientCompanyId(user);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });

  if (!company) {
    throw new AuthorizationError("Unauthorized.");
  }

  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId: user.id,
      companyId,
      status: "ACTIVE",
    },
    select: { role: true },
  });

  if (!membership) {
    throw new AuthorizationError("Unauthorized.");
  }

  return {
    ...toAuthUser(user),
    companyId,
    membershipRole: membership.role,
    company,
  };
}

/**
 * Client portal entry: authenticated CLIENT with company boundary loaded
 * from ACTIVE membership (never from URL/query/JWT).
 */
export async function requireClientPortal(): Promise<ClientPortalContext> {
  const user = await loadSessionUser();
  return authorizeClientPortalAccess(user);
}

/**
 * DB-derived post-login destination. JWT role is not the tenant authority.
 */
export async function requirePostAuthDestination(): Promise<string> {
  const user = await loadSessionUser();
  const membership =
    user.role === PortalRole.CLIENT
      ? await prisma.organizationMember.findFirst({
          where: {
            userId: user.id,
            status: "ACTIVE",
          },
          select: { role: true },
        })
      : null;

  const path = postAuthPathForActor({
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt,
    companyId: user.companyId,
    membershipRole: membership?.role ?? null,
  });

  if (path === "/client") {
    console.info("[onboarding] onboarding_reached_client", { userId: user.id });
  }

  return path;
}

export async function requireInterviewer(): Promise<AuthUser> {
  const user = await requireRole(PortalRole.INTERVIEWER);
  requireInterviewerProfileId(user);
  return user;
}

export type InterviewerPortalContext = AuthUser & {
  interviewerId: number;
  interviewer: {
    id: number;
    name: string;
    category: string;
  };
};

/**
 * Interviewer portal entry: authenticated INTERVIEWER with profile boundary
 * loaded from the database (never from URL/query input).
 */
export async function requireInterviewerPortal(): Promise<InterviewerPortalContext> {
  const user = await requireInterviewer();
  const interviewerId = requireInterviewerProfileId(user);

  const interviewer = await prisma.interviewer.findUnique({
    where: { id: interviewerId },
    select: {
      id: true,
      name: true,
      category: true,
    },
  });

  if (!interviewer) {
    throw new AuthorizationError("Unauthorized.");
  }

  return {
    ...user,
    interviewerId,
    interviewer,
  };
}

export function assertAdmin(user: AuthUser) {
  if (user.role !== PortalRole.ADMIN) {
    throw new AuthorizationError();
  }
}

export function assertClientCompanyAccess(user: AuthUser, companyId: number) {
  if (user.role === PortalRole.ADMIN) {
    return;
  }

  if (user.role !== PortalRole.CLIENT) {
    throw new AuthorizationError();
  }

  if (requireClientCompanyId(user) !== companyId) {
    denyResource();
  }
}

export function assertInterviewerJobAccess(
  user: AuthUser,
  job: { assignedInterviewerId: number | null },
) {
  if (user.role === PortalRole.ADMIN) {
    return;
  }

  if (user.role !== PortalRole.INTERVIEWER) {
    throw new AuthorizationError();
  }

  if (requireInterviewerProfileId(user) !== job.assignedInterviewerId) {
    denyResource();
  }
}

export function assertJobAccessible(
  user: AuthUser,
  job: { companyId: number; assignedInterviewerId: number | null },
) {
  if (user.role === PortalRole.ADMIN) {
    return;
  }

  if (user.role === PortalRole.CLIENT) {
    if (requireClientCompanyId(user) !== job.companyId) {
      denyResource();
    }
    return;
  }

  if (user.role === PortalRole.INTERVIEWER) {
    if (requireInterviewerProfileId(user) !== job.assignedInterviewerId) {
      denyResource();
    }
    return;
  }

  throw new AuthorizationError();
}

export function jobScopeWhere(user: AuthUser): Prisma.JobWhereInput {
  if (user.role === PortalRole.ADMIN) {
    return {};
  }

  if (user.role === PortalRole.CLIENT) {
    return { companyId: requireClientCompanyId(user) };
  }

  if (user.role === PortalRole.INTERVIEWER) {
    return { assignedInterviewerId: requireInterviewerProfileId(user) };
  }

  throw new AuthorizationError();
}

export function companyScopeWhere(
  user: AuthUser,
): Prisma.CompanyWhereInput | null {
  if (user.role === PortalRole.ADMIN) {
    return {};
  }

  if (user.role === PortalRole.CLIENT) {
    return { id: requireClientCompanyId(user) };
  }

  // Interviewers have no company directory access.
  return null;
}

export function candidateScopeWhere(
  user: AuthUser,
): Prisma.CandidateWhereInput {
  if (user.role === PortalRole.ADMIN) {
    return {};
  }

  if (user.role === PortalRole.CLIENT) {
    return { companyId: requireClientCompanyId(user) };
  }

  if (user.role === PortalRole.INTERVIEWER) {
    return {
      applications: {
        some: {
          job: {
            assignedInterviewerId: requireInterviewerProfileId(user),
          },
        },
      },
    };
  }

  throw new AuthorizationError();
}

export function applicationScopeWhere(
  user: AuthUser,
): Prisma.ApplicationWhereInput {
  if (user.role === PortalRole.ADMIN) {
    return {};
  }

  if (user.role === PortalRole.CLIENT) {
    return {
      job: {
        companyId: requireClientCompanyId(user),
      },
    };
  }

  if (user.role === PortalRole.INTERVIEWER) {
    return {
      job: {
        assignedInterviewerId: requireInterviewerProfileId(user),
      },
    };
  }

  throw new AuthorizationError();
}

export function evaluationScopeWhere(
  user: AuthUser,
): Prisma.EvaluationWhereInput {
  if (user.role === PortalRole.INTERVIEWER) {
    return {
      interviewerId: requireInterviewerProfileId(user),
      application: applicationScopeWhere(user),
    };
  }

  return {
    application: applicationScopeWhere(user),
  };
}

export function interviewScopeWhere(
  user: AuthUser,
): Prisma.InterviewWhereInput {
  return {
    application: applicationScopeWhere(user),
  };
}

export function codingTestScopeWhere(
  user: AuthUser,
): Prisma.CodingTestWhereInput {
  return {
    application: applicationScopeWhere(user),
  };
}

export function reportScopeWhere(user: AuthUser): Prisma.ReportWhereInput {
  return {
    application: applicationScopeWhere(user),
  };
}

export function notificationScopeWhere(
  user: AuthUser,
): Prisma.NotificationWhereInput {
  if (user.role === PortalRole.ADMIN) {
    return {};
  }

  if (user.role === PortalRole.CLIENT) {
    return {
      type: "CLIENT_SHORTLIST_READY",
      companyId: requireClientCompanyId(user),
      job: {
        companyId: requireClientCompanyId(user),
      },
    };
  }

  if (user.role === PortalRole.INTERVIEWER) {
    return {
      interviewerId: requireInterviewerProfileId(user),
      type: {
        in: ["INTERVIEWER_REQUIREMENT_READY", "INTERVIEWER_DATABASE_READY"],
      },
    };
  }

  throw new AuthorizationError();
}

export function assertCanRetryNotificationEmail(user: AuthUser) {
  if (user.role !== PortalRole.ADMIN) {
    throw new AuthorizationError("Resource not found.");
  }
}

export function interviewerScopeWhere(
  user: AuthUser,
): Prisma.InterviewerWhereInput | null {
  if (user.role === PortalRole.ADMIN) {
    return {};
  }

  if (user.role === PortalRole.CLIENT) {
    return {
      assignedJobs: {
        some: {
          companyId: requireClientCompanyId(user),
        },
      },
    };
  }

  if (user.role === PortalRole.INTERVIEWER) {
    return { id: requireInterviewerProfileId(user) };
  }

  throw new AuthorizationError();
}

/**
 * Billing is Admin-global or Client company-scoped.
 * Interviewers have no billing access.
 */
export function billingScopeWhere(
  user: AuthUser,
): Prisma.BillingRecordWhereInput {
  if (user.role === PortalRole.ADMIN) {
    return {};
  }

  if (user.role === PortalRole.CLIENT) {
    return { companyId: requireClientCompanyId(user) };
  }

  denyResource();
}

export async function requireCompanyAccess(companyId: number) {
  const user = await requireUser();

  if (user.role === PortalRole.ADMIN) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      denyResource();
    }
    return { user, company };
  }

  if (user.role === PortalRole.CLIENT) {
    if (requireClientCompanyId(user) !== companyId) {
      denyResource();
    }
    return { user, company: { id: companyId } };
  }

  denyResource();
}

export async function requireJobAccess(jobId: number) {
  const user = await requireUser();
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      ...jobScopeWhere(user),
    },
    select: {
      id: true,
      companyId: true,
      assignedInterviewerId: true,
    },
  });

  if (!job) {
    denyResource();
  }

  return { user, job };
}

export async function requireCandidateAccess(candidateId: number) {
  const user = await requireUser();
  const candidate = await prisma.candidate.findFirst({
    where: {
      id: candidateId,
      ...candidateScopeWhere(user),
    },
    select: {
      id: true,
      companyId: true,
    },
  });

  if (!candidate) {
    denyResource();
  }

  return { user, candidate };
}

export async function requireApplicationAccess(applicationId: number) {
  const user = await requireUser();
  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      ...applicationScopeWhere(user),
    },
    select: {
      id: true,
      jobId: true,
      candidateId: true,
      job: {
        select: {
          id: true,
          companyId: true,
          assignedInterviewerId: true,
        },
      },
    },
  });

  if (!application) {
    denyResource();
  }

  return { user, application };
}

export async function requireEvaluationAccess(evaluationId: number) {
  const user = await requireUser();
  const evaluation = await prisma.evaluation.findFirst({
    where: {
      id: evaluationId,
      ...evaluationScopeWhere(user),
    },
    select: {
      id: true,
      applicationId: true,
      interviewerId: true,
      application: {
        select: {
          id: true,
          jobId: true,
          job: {
            select: {
              id: true,
              companyId: true,
              assignedInterviewerId: true,
            },
          },
        },
      },
    },
  });

  if (!evaluation) {
    denyResource();
  }

  return { user, evaluation };
}
