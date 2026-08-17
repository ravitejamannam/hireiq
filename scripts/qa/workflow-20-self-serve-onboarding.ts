/**
 * T80: self-serve client onboarding.
 *
 * AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED
 * signUpClient / createClientCompany / resendVerificationEmail /
 * requestPasswordReset / inviteOrganizationMember require Auth.js.
 *
 * This workflow tests the production signup, verification, company
 * onboarding, invitation, password-reset, rate-limit, and draft-job
 * functions those actions call, plus Prisma uniqueness and source scans.
 * It is not a Playwright browser suite and does not fake Auth.js.
 */
import {
  AuthorizationError,
  assertClientCompanyAccess,
  authorizeClientPortalAccess,
  hydrateAuthUser,
  jobScopeWhere,
} from "../../lib/auth/authorization";
import {
  postAuthPathForActor,
  resolveClientOnboardingState,
} from "../../lib/auth/onboarding-state";
import { hashPassword, verifyPassword } from "../../lib/auth/password";
import {
  PASSWORD_RESET_TTL_MS,
  requestPasswordResetForEmail,
  resetPasswordWithToken,
} from "../../lib/auth/password-reset";
import {
  AUTH_RATE_LIMITS,
  consumeAuthRateLimit,
  RateLimitError,
  rateLimitKeyForEmail,
} from "../../lib/auth/rate-limit";
import { generateSecureToken, hashSecureToken } from "../../lib/auth/secure-token";
import { registerClientAccount, SignupError } from "../../lib/auth/signup-service";
import { createClientRequirementDraftForCompany } from "../../lib/organizations/client-requirement-draft";
import { CompanyOnboardingError, createClientCompanyForUser } from "../../lib/organizations/company-onboarding";
import {
  consumeEmailVerificationTokenForUser,
  issueEmailVerificationTokenForUser,
} from "../../lib/organizations/email-verification-service";
import {
  acceptOrganizationInvitationForUser,
  inviteOrganizationMemberForOwner,
} from "../../lib/organizations/invitation-service";
import { OrganizationMembershipError } from "../../lib/validation/organization-membership-validation";
import {
  assert,
  assertIncludes,
  assertNotIncludes,
  assertThrows,
} from "./assertions";
import { loadV1Qa, prisma, source, TMP_PREFIX } from "./fixtures";

const PREFIX = `${TMP_PREFIX}-W20`;
const EMAIL_PREFIX = "tmp-full-qa-w20";
const QA_PASSWORD = "V1QaPass123!";

async function cleanupW20() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const companies = await prisma.company.findMany({
    where: { name: { startsWith: PREFIX } },
    select: { id: true },
  });
  const companyIds = companies.map((company) => company.id);

  await prisma.passwordResetToken.deleteMany({
    where: { userId: { in: userIds.length ? userIds : [-1] } },
  });
  await prisma.emailVerificationToken.deleteMany({
    where: {
      OR: [
        { email: { startsWith: EMAIL_PREFIX } },
        { userId: { in: userIds.length ? userIds : [-1] } },
      ],
    },
  });
  await prisma.invitation.deleteMany({
    where: {
      OR: [
        { email: { startsWith: EMAIL_PREFIX } },
        { invitedByUserId: { in: userIds.length ? userIds : [-1] } },
        { companyId: { in: companyIds.length ? companyIds : [-1] } },
      ],
    },
  });
  const w20Jobs = await prisma.job.findMany({
    where: {
      OR: [
        { title: { startsWith: PREFIX } },
        { companyId: { in: companyIds.length ? companyIds : [-1] } },
      ],
    },
    select: { id: true },
  });
  const w20JobIds = w20Jobs.map((job) => job.id);
  if (w20JobIds.length) {
    await prisma.job.updateMany({
      where: { id: { in: w20JobIds } },
      data: { currentPublishedSpecificationVersionId: null },
    });
    await prisma.jobSpecificationVersion.deleteMany({
      where: { jobId: { in: w20JobIds } },
    });
    await prisma.job.deleteMany({
      where: { id: { in: w20JobIds } },
    });
  }
  if (userIds.length) {
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { companyId: null },
    });
    await prisma.organizationMember.deleteMany({
      where: {
        OR: [{ userId: { in: userIds } }, { invitedByUserId: { in: userIds } }],
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }
  if (companyIds.length) {
    await prisma.organizationMember.deleteMany({
      where: { companyId: { in: companyIds } },
    });
    await prisma.company.deleteMany({
      where: { id: { in: companyIds } },
    });
  }
  await prisma.authRateLimit.deleteMany({
    where: { key: { contains: EMAIL_PREFIX } },
  });
}

export async function runWorkflow20() {
  await cleanupW20();
  const qa = await loadV1Qa();

  try {
    console.log("W20 self-serve onboarding");

    const signupSource = source("lib/auth/signup-service.ts");
    const authJsSource = source("auth.ts");
    const routesSource = source("lib/auth/routes.ts");
    const rateLimitSource = source("lib/auth/rate-limit.ts");
    const companySource = source("lib/organizations/company-onboarding.ts");
    const draftSource = source("lib/organizations/client-requirement-draft.ts");
    const resetSource = source("lib/auth/password-reset.ts");
    const schemaSource = source("prisma/schema.prisma");

    assertIncludes(
      signupSource,
      "role: PortalRole.CLIENT",
      "source: signup hard-codes CLIENT",
    );
    assertIncludes(
      signupSource,
      "companyId: null",
      "source: signup companyId is null",
    );
    assertIncludes(
      signupSource,
      "emailVerifiedAt: null",
      "source: signup emailVerifiedAt is null",
    );
    assertNotIncludes(
      authJsSource,
      "token.companyId",
      "TEST AC: JWT does not store companyId",
    );
    assertIncludes(
      routesSource,
      "clientPostAuthPath()",
      "source: CLIENT home path is post-auth",
    );
    assertIncludes(
      rateLimitSource,
      "PostgreSQL-backed",
      "source: rate limiter is PostgreSQL-backed",
    );
    assertNotIncludes(
      rateLimitSource,
      "ioredis",
      "source: rate limiter does not use ioredis",
    );
    assertIncludes(
      companySource,
      "role: OrganizationMemberRole.OWNER",
      "source: self-serve company creates OWNER",
    );
    assertIncludes(
      draftSource,
      'requirementLifecycle: "REQUIREMENT_DRAFTED"',
      "source: draft job stays REQUIREMENT_DRAFTED",
    );
    assertNotIncludes(
      schemaSource,
      "OrganizationDomain",
      "source: no OrganizationDomain",
    );
    assertNotIncludes(
      schemaSource,
      "OrganizationOnboarding",
      "source: no OrganizationOnboarding",
    );
    assertIncludes(
      resetSource,
      "passwordResetToken",
      "source: password reset uses dedicated tokens",
    );

    const signupEmail = `${EMAIL_PREFIX}-signup@hireiq.local`;
    const created = await registerClientAccount({
      name: `${PREFIX} Signup`,
      email: signupEmail,
      password: QA_PASSWORD,
      companyId: qa.companyAlpha.id,
      role: "ADMIN",
      organizationMemberRole: "OWNER",
    } as {
      name: string;
      email: string;
      password: string;
      companyId: number;
      role: string;
      organizationMemberRole: string;
    });

    const signupUser = await prisma.user.findUniqueOrThrow({
      where: { id: created.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        interviewerId: true,
        emailVerifiedAt: true,
      },
    });

    assert(signupUser.role === "CLIENT", "TEST A: signup creates CLIENT");
    assert(signupUser.companyId === null, "TEST B: signup companyId is null");
    assert(
      signupUser.emailVerifiedAt === null,
      "TEST C: signup emailVerifiedAt is null",
    );
    assert(
      String(signupUser.role) !== "ADMIN",
      "TEST D: signup cannot create ADMIN",
    );
    assert(
      (await prisma.organizationMember.count({ where: { userId: signupUser.id } })) ===
        0,
      "TEST E: signup cannot create OWNER membership",
    );
    assert(
      signupUser.companyId !== qa.companyAlpha.id,
      "TEST F: signup cannot supply companyId",
    );

    await assertThrows(
      () =>
        registerClientAccount({
          name: `${PREFIX} Dup`,
          email: signupEmail,
          password: QA_PASSWORD,
        }),
      (error) =>
        error instanceof SignupError &&
        error.message === "Unable to create your account with those details.",
      "TEST G: duplicate email fails safely",
    );

    const issued = await issueEmailVerificationTokenForUser({
      userId: signupUser.id,
    });
    const verified = await consumeEmailVerificationTokenForUser({
      userId: signupUser.id,
      token: issued.rawToken,
    });
    assert(verified.verified === true, "TEST H: verification succeeds once");
    await assertThrows(
      () =>
        consumeEmailVerificationTokenForUser({
          userId: signupUser.id,
          token: issued.rawToken,
        }),
      (error) => error instanceof OrganizationMembershipError,
      "TEST I: verification replay fails",
    );

    const expiredUser = await prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}-expired-verify@hireiq.local`,
        name: `${PREFIX} Expired Verify`,
        role: "CLIENT",
        passwordHash: await hashPassword(QA_PASSWORD),
        companyId: null,
        emailVerifiedAt: null,
      },
      select: { id: true },
    });
    const expiredToken = generateSecureToken();
    await prisma.emailVerificationToken.create({
      data: {
        userId: expiredUser.id,
        email: `${EMAIL_PREFIX}-expired-verify@hireiq.local`,
        tokenHash: expiredToken.tokenHash,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await assertThrows(
      () =>
        consumeEmailVerificationTokenForUser({
          userId: expiredUser.id,
          token: expiredToken.rawToken,
        }),
      (error) => error instanceof OrganizationMembershipError,
      "TEST J: verification expiry fails",
    );

    const resendUser = await prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}-resend@hireiq.local`,
        name: `${PREFIX} Resend`,
        role: "CLIENT",
        passwordHash: await hashPassword(QA_PASSWORD),
        companyId: null,
        emailVerifiedAt: null,
      },
      select: { id: true, email: true },
    });
    const firstToken = await issueEmailVerificationTokenForUser({
      userId: resendUser.id,
    });
    const secondToken = await issueEmailVerificationTokenForUser({
      userId: resendUser.id,
    });
    await assertThrows(
      () =>
        consumeEmailVerificationTokenForUser({
          userId: resendUser.id,
          token: firstToken.rawToken,
        }),
      (error) => error instanceof OrganizationMembershipError,
      "TEST K: resend supersedes previous token",
    );
    const resendVerified = await consumeEmailVerificationTokenForUser({
      userId: resendUser.id,
      token: secondToken.rawToken,
    });
    assert(resendVerified.verified === true, "TEST K: new verification token works");

    await assertThrows(
      () =>
        authorizeClientPortalAccess({
          ...signupUser,
          emailVerifiedAt: null,
        }),
      (error) => error instanceof AuthorizationError,
      "TEST L: unverified Client cannot enter Client authorization",
    );

    const verifiedNoTenant = await prisma.user.findUniqueOrThrow({
      where: { id: signupUser.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        interviewerId: true,
        emailVerifiedAt: true,
      },
    });
    const hydratedNoTenant = await hydrateAuthUser(verifiedNoTenant);
    assert(
      hydratedNoTenant.companyId === null,
      "TEST M: verified Client without membership has null companyId",
    );
    assert(
      resolveClientOnboardingState({
        role: hydratedNoTenant.role,
        emailVerifiedAt: hydratedNoTenant.emailVerifiedAt,
        companyId: hydratedNoTenant.companyId,
        membershipRole: null,
      }) === "EMAIL_VERIFIED_NO_TENANT",
      "TEST M: onboarding state is EMAIL_VERIFIED_NO_TENANT",
    );
    assert(
      postAuthPathForActor({
        role: hydratedNoTenant.role,
        emailVerifiedAt: hydratedNoTenant.emailVerifiedAt,
        companyId: hydratedNoTenant.companyId,
        membershipRole: null,
      }) === "/onboarding",
      "TEST M: verified Client with no membership routes to onboarding",
    );

    const companyName = `${PREFIX} Co Primary`;
    const createdCompany = await createClientCompanyForUser({
      userId: signupUser.id,
      name: companyName,
      industry: "Software",
      employees: 12,
    });
    const companies = await prisma.company.findMany({
      where: { name: companyName },
    });
    assert(companies.length === 1, "TEST N: create company creates exactly one Company");
    const owners = await prisma.organizationMember.findMany({
      where: {
        userId: signupUser.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    assert(owners.length === 1, "TEST O: create company creates exactly one OWNER");
    const projected = await prisma.user.findUniqueOrThrow({
      where: { id: signupUser.id },
      select: { companyId: true },
    });
    assert(
      projected.companyId === owners[0].companyId &&
        projected.companyId === createdCompany.companyId,
      "TEST P: User.companyId matches membership companyId",
    );

    const orphanName = `${PREFIX} Co Orphan`;
    await assertThrows(
      () =>
        createClientCompanyForUser({
          userId: signupUser.id,
          name: orphanName,
          industry: "Software",
          employees: 3,
        }),
      (error) => error instanceof CompanyOnboardingError,
      "TEST Q: second create company is rejected",
    );
    assert(
      (await prisma.company.count({ where: { name: orphanName } })) === 0,
      "TEST Q: failed create company does not leave an orphan Company",
    );

    const concurrentUser = await prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}-concurrent@hireiq.local`,
        name: `${PREFIX} Concurrent`,
        role: "CLIENT",
        passwordHash: await hashPassword(QA_PASSWORD),
        companyId: null,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    const concurrentA = `${PREFIX} Co Concurrent A`;
    const concurrentB = `${PREFIX} Co Concurrent B`;
    const concurrentResults = await Promise.allSettled([
      createClientCompanyForUser({
        userId: concurrentUser.id,
        name: concurrentA,
        industry: "Software",
        employees: 8,
      }),
      createClientCompanyForUser({
        userId: concurrentUser.id,
        name: concurrentB,
        industry: "Software",
        employees: 8,
      }),
    ]);
    assert(
      concurrentResults.filter((result) => result.status === "fulfilled").length === 1,
      "TEST R: concurrent create company succeeds once",
    );
    assert(
      concurrentResults.filter((result) => result.status === "rejected").length === 1,
      "TEST R: concurrent create company fails safely",
    );
    assert(
      (await prisma.company.count({
        where: { name: { in: [concurrentA, concurrentB] } },
      })) === 1,
      "TEST R: concurrent create leaves exactly one Company",
    );
    assert(
      (await prisma.organizationMember.count({
        where: { userId: concurrentUser.id, status: "ACTIVE" },
      })) === 1,
      "TEST S: second active membership cannot be created",
    );

    const inviteEmail = `${EMAIL_PREFIX}-invitee@hireiq.local`;
    const invited = await inviteOrganizationMemberForOwner({
      actorUserId: signupUser.id,
      companyId: createdCompany.companyId,
      email: inviteEmail,
    });
    const inviteRaw = "w20-invitation-signup-token";
    await prisma.invitation.update({
      where: { id: invited.invitationId },
      data: { tokenHash: hashSecureToken(inviteRaw) },
    });
    const invitee = await registerClientAccount({
      name: `${PREFIX} Invitee`,
      email: inviteEmail,
      password: QA_PASSWORD,
    });
    const accepted = await acceptOrganizationInvitationForUser({
      userId: invitee.userId,
      token: inviteRaw,
    });
    assert(
      accepted.companyId === createdCompany.companyId,
      "TEST T: invitation signup path works",
    );
    const inviteMembership = await prisma.organizationMember.findUniqueOrThrow({
      where: {
        companyId_userId: {
          companyId: createdCompany.companyId,
          userId: invitee.userId,
        },
      },
    });
    assert(
      inviteMembership.role === "MEMBER" && inviteMembership.status === "ACTIVE",
      "TEST U: invited user becomes MEMBER",
    );
    assert(
      String(inviteMembership.role) !== "OWNER",
      "TEST V: invitation cannot create OWNER",
    );
    const inviteeUser = await prisma.user.findUniqueOrThrow({
      where: { id: invitee.userId },
      select: { role: true, emailVerifiedAt: true, companyId: true },
    });
    assert(inviteeUser.role === "CLIENT", "TEST W: invitation cannot create ADMIN");
    assert(
      inviteeUser.emailVerifiedAt !== null,
      "TEST T: invitation mailbox proof sets emailVerifiedAt",
    );

    const wrongInviteEmail = `${EMAIL_PREFIX}-intended@hireiq.local`;
    const wrongEmailUser = await prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}-wrong@hireiq.local`,
        name: `${PREFIX} Wrong`,
        role: "CLIENT",
        passwordHash: await hashPassword(QA_PASSWORD),
        companyId: null,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    const wrongInvite = await inviteOrganizationMemberForOwner({
      actorUserId: signupUser.id,
      companyId: createdCompany.companyId,
      email: wrongInviteEmail,
    });
    const wrongRaw = "w20-wrong-email-invitation-token";
    await prisma.invitation.update({
      where: { id: wrongInvite.invitationId },
      data: { tokenHash: hashSecureToken(wrongRaw) },
    });
    await assertThrows(
      () =>
        acceptOrganizationInvitationForUser({
          userId: wrongEmailUser.id,
          token: wrongRaw,
        }),
      (error) => error instanceof OrganizationMembershipError,
      "TEST X: wrong email cannot accept",
    );

    const expiredInviteEmail = `${EMAIL_PREFIX}-expired-invite@hireiq.local`;
    const expiredInviteUser = await prisma.user.create({
      data: {
        email: expiredInviteEmail,
        name: `${PREFIX} Expired Invite`,
        role: "CLIENT",
        passwordHash: await hashPassword(QA_PASSWORD),
        companyId: null,
        emailVerifiedAt: null,
      },
      select: { id: true },
    });
    const expiredInvite = await inviteOrganizationMemberForOwner({
      actorUserId: signupUser.id,
      companyId: createdCompany.companyId,
      email: expiredInviteEmail,
    });
    const expiredRaw = "w20-expired-invitation-token";
    await prisma.invitation.update({
      where: { id: expiredInvite.invitationId },
      data: {
        tokenHash: hashSecureToken(expiredRaw),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await assertThrows(
      () =>
        acceptOrganizationInvitationForUser({
          userId: expiredInviteUser.id,
          token: expiredRaw,
        }),
      (error) => error instanceof OrganizationMembershipError,
      "TEST Y: expired invitation fails",
    );

    const revokedInviteEmail = `${EMAIL_PREFIX}-revoked-invite@hireiq.local`;
    const revokedInviteUser = await prisma.user.create({
      data: {
        email: revokedInviteEmail,
        name: `${PREFIX} Revoked Invite`,
        role: "CLIENT",
        passwordHash: await hashPassword(QA_PASSWORD),
        companyId: null,
        emailVerifiedAt: null,
      },
      select: { id: true },
    });
    const revokedInvite = await inviteOrganizationMemberForOwner({
      actorUserId: signupUser.id,
      companyId: createdCompany.companyId,
      email: revokedInviteEmail,
    });
    const revokedRaw = "w20-revoked-invitation-token";
    await prisma.invitation.update({
      where: { id: revokedInvite.invitationId },
      data: {
        tokenHash: hashSecureToken(revokedRaw),
        revokedAt: new Date(),
      },
    });
    await assertThrows(
      () =>
        acceptOrganizationInvitationForUser({
          userId: revokedInviteUser.id,
          token: revokedRaw,
        }),
      (error) => error instanceof OrganizationMembershipError,
      "TEST Z: revoked invitation fails",
    );

    await assertThrows(
      () =>
        acceptOrganizationInvitationForUser({
          userId: invitee.userId,
          token: inviteRaw,
        }),
      (error) => error instanceof OrganizationMembershipError,
      "TEST AA: invitation cannot be replayed",
    );

    const draft = await createClientRequirementDraftForCompany({
      companyId: createdCompany.companyId,
      title: `${PREFIX} First Role`,
    });
    assert(
      draft.companyId === createdCompany.companyId,
      "TEST AI: draft Job uses membership company",
    );
    assert(
      draft.clientCompletedAt === null &&
        draft.sourcingAccessReceivedAt === null &&
        draft.shortlistingDueAt === null &&
        draft.shortlistingCompletedAt === null,
      "TEST AJ: draft Job does not plant T72 timestamps",
    );

    await assertThrows(
      () => assertClientCompanyAccess(qa.clientBeta, createdCompany.companyId),
      (error) => error instanceof AuthorizationError,
      "TEST AB: cross-company access denied",
    );
    const betaJobs = await prisma.job.findMany({
      where: {
        AND: [jobScopeWhere(qa.clientBeta), { id: draft.id }],
      },
    });
    assert(betaJobs.length === 0, "TEST AB: Beta cannot read Alpha draft Job");

    const rateEmail = `${EMAIL_PREFIX}-ratelimit@hireiq.local`;
    const rateKey = rateLimitKeyForEmail(rateEmail);
    for (let i = 0; i < AUTH_RATE_LIMITS.signupEmail.max; i += 1) {
      await consumeAuthRateLimit({ name: "signupEmail", key: rateKey });
    }
    await assertThrows(
      () => consumeAuthRateLimit({ name: "signupEmail", key: rateKey }),
      (error) => error instanceof RateLimitError,
      "TEST AD: rate limits exist and are enforced",
    );

    const resetUser = await prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}-reset@hireiq.local`,
        name: `${PREFIX} Reset`,
        role: "CLIENT",
        passwordHash: await hashPassword(QA_PASSWORD),
        companyId: null,
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });
    const resetToken = generateSecureToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: resetUser.id,
        tokenHash: resetToken.tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });
    await resetPasswordWithToken({
      token: resetToken.rawToken,
      password: "NewPass123!",
    });
    const resetRow = await prisma.user.findUniqueOrThrow({
      where: { id: resetUser.id },
      select: { passwordHash: true },
    });
    assert(
      await verifyPassword("NewPass123!", resetRow.passwordHash),
      "TEST AE: password reset succeeds once",
    );
    await assertThrows(
      () =>
        resetPasswordWithToken({
          token: resetToken.rawToken,
          password: "AnotherPass123!",
        }),
      "That reset link is invalid or has expired.",
      "TEST AF: password reset replay fails",
    );

    const expiredReset = generateSecureToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: resetUser.id,
        tokenHash: expiredReset.tokenHash,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await assertThrows(
      () =>
        resetPasswordWithToken({
          token: expiredReset.rawToken,
          password: "AnotherPass123!",
        }),
      "That reset link is invalid or has expired.",
      "TEST AG: password reset expiry fails",
    );

    const unknownReset = await requestPasswordResetForEmail(
      `${EMAIL_PREFIX}-unknown@hireiq.local`,
    );
    const knownReset = await requestPasswordResetForEmail(
      `${EMAIL_PREFIX}-reset@hireiq.local`,
    );
    assert(
      unknownReset.accepted === true && knownReset.accepted === true,
      "TEST AH: forgot-password does not enumerate",
    );
    assertIncludes(
      source("app/actions/password-reset-actions.ts"),
      "GENERIC_PASSWORD_RESET_REQUEST",
      "TEST AH: forgot-password always returns the generic message",
    );
    assertIncludes(
      source("lib/auth/password-reset.ts"),
      'If an account exists for this email, you\'ll receive instructions.',
      "TEST AH: generic forgot-password copy is defined",
    );

    await assertThrows(
      () =>
        inviteOrganizationMemberForOwner({
          actorUserId: invitee.userId,
          companyId: createdCompany.companyId,
          email: `${EMAIL_PREFIX}-member-invite@hireiq.local`,
        }),
      (error) => error instanceof OrganizationMembershipError,
      "MEMBER cannot invite members",
    );

    const v1qaAlpha = await prisma.user.findUniqueOrThrow({
      where: { email: "v1qa.client.alpha@hireiq.local" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        companyId: true,
        interviewerId: true,
        emailVerifiedAt: true,
      },
    });
    assert(
      postAuthPathForActor({
        role: v1qaAlpha.role,
        emailVerifiedAt: v1qaAlpha.emailVerifiedAt,
        companyId: v1qaAlpha.companyId,
        membershipRole: "OWNER",
      }) === "/client",
      "V1QA Client Alpha still routes to /client",
    );
  } finally {
    await cleanupW20();
  }
}
