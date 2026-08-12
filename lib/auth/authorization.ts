import { PortalRole, type Prisma } from "@prisma/client";

import { auth } from "@/auth";
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
} satisfies Prisma.UserSelect;

function denyResource(): never {
  throw new AuthorizationError("Resource not found.");
}

function requireClientCompanyId(user: AuthUser): number {
  if (user.companyId === null) {
    throw new AuthorizationError("Unauthorized.");
  }
  return user.companyId;
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
 */
export async function requireUser(): Promise<AuthUser> {
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

  return user;
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
  const user = await requireRole(PortalRole.CLIENT);
  requireClientCompanyId(user);
  return user;
}

export async function requireInterviewer(): Promise<AuthUser> {
  const user = await requireRole(PortalRole.INTERVIEWER);
  requireInterviewerProfileId(user);
  return user;
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
      job: {
        companyId: requireClientCompanyId(user),
      },
    };
  }

  if (user.role === PortalRole.INTERVIEWER) {
    return {
      interviewerId: requireInterviewerProfileId(user),
    };
  }

  throw new AuthorizationError();
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
