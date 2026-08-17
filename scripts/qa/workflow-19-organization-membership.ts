/**
 * T79: organization membership, invitations, and email verification.
 *
 * AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED
 * inviteOrganizationMember / revokeOrganizationInvitation /
 * acceptOrganizationInvitation / verifyEmailAddress require Auth.js.
 *
 * This workflow tests the production invitation, verification, and
 * authorization-hydration functions those actions call, plus Prisma
 * uniqueness and source scans. It is not a Playwright browser suite.
 */
import {
  OrganizationMemberRole,
  OrganizationMemberStatus,
  Prisma,
} from "@prisma/client";

import { hashPassword } from "../../lib/auth/password";
import {
  AuthorizationError,
  assertClientCompanyAccess,
  authorizeClientPortalAccess,
  hydrateAuthUser,
  jobScopeWhere,
} from "../../lib/auth/authorization";
import { hashSecureToken } from "../../lib/auth/secure-token";
import { resolveOwningClientRecipient } from "../../lib/communication/notification-service";
import {
  consumeEmailVerificationTokenForUser,
  issueEmailVerificationTokenForUser,
} from "../../lib/organizations/email-verification-service";
import {
  acceptOrganizationInvitationForUser,
  inviteOrganizationMemberForOwner,
  revokeOrganizationInvitationForOwner,
} from "../../lib/organizations/invitation-service";
import { OrganizationMembershipError } from "../../lib/validation/organization-membership-validation";
import {
  assert,
  assertIncludes,
  assertNotIncludes,
  assertThrows,
} from "./assertions";
import { loadV1Qa, prisma, source, TMP_PREFIX } from "./fixtures";

const PREFIX = `${TMP_PREFIX}-W19`;
const EMAIL_PREFIX = "tmp-full-qa-w19";

function isUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function cleanupW19() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);

  await prisma.invitation.deleteMany({
    where: {
      OR: [
        { email: { startsWith: EMAIL_PREFIX } },
        { invitedByUserId: { in: userIds.length ? userIds : [-1] } },
      ],
    },
  });
  await prisma.emailVerificationToken.deleteMany({
    where: {
      OR: [
        { email: { startsWith: EMAIL_PREFIX } },
        { userId: { in: userIds.length ? userIds : [-1] } },
      ],
    },
  });
  if (userIds.length) {
    await prisma.organizationMember.deleteMany({
      where: {
        OR: [{ userId: { in: userIds } }, { invitedByUserId: { in: userIds } }],
      },
    });
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
  }
}

async function createClientUser(params: {
  email: string;
  companyId: number | null;
  emailVerifiedAt: Date | null;
}) {
  return prisma.user.create({
    data: {
      email: params.email,
      name: `${PREFIX} Client`,
      role: "CLIENT",
      passwordHash: await hashPassword("V1QaPass123!"),
      companyId: params.companyId,
      emailVerifiedAt: params.emailVerifiedAt,
    },
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
}

export async function runWorkflow19() {
  await cleanupW19();
  const qa = await loadV1Qa();

  try {
    console.log("W19 organization membership");

    const authSource = source("lib/auth/authorization.ts");
    const authJsSource = source("auth.ts");
    const orgActions = source("app/actions/organization-actions.ts");
    const invitationService = source("lib/organizations/invitation-service.ts");
    const migrationSql = source(
      "prisma/migrations/20260817120000_organization_membership/migration.sql",
    );
    const notificationService = source(
      "lib/communication/notification-service.ts",
    );
    const shortlistEmail = source(
      "lib/communication/shortlist-ready-email.ts",
    );

    // --- source ---
    assertIncludes(
      authJsSource,
      "token.id = user.id",
      "source: JWT stores user id",
    );
    assertNotIncludes(
      authJsSource,
      "token.companyId",
      "source: JWT does not store companyId",
    );
    assertNotIncludes(
      authJsSource,
      "session.user.companyId",
      "source: session does not store companyId",
    );
    assertIncludes(
      orgActions,
      "export async function inviteOrganizationMember(email: unknown)",
      "source: invite accepts email only",
    );
    assertIncludes(
      orgActions,
      "export async function acceptOrganizationInvitation(token: unknown)",
      "source: accept accepts token only",
    );
    assertNotIncludes(
      orgActions,
      "membershipId",
      "source: actions ignore browser membershipId",
    );
    assertIncludes(
      orgActions,
      "companyId: client.companyId",
      "source: invite company comes from authenticated membership",
    );
    assertIncludes(
      invitationService,
      "role: INVITATION_MEMBER_ROLE",
      "source: invite role is always MEMBER",
    );
    assertIncludes(
      invitationService,
      "assertInvitationRoleIsMember(invitation.role)",
      "source: accept rejects non-MEMBER invitation roles",
    );
    assertIncludes(
      migrationSql,
      'CREATE UNIQUE INDEX "OrganizationMember_one_active_owner_per_company"',
      "source: one ACTIVE OWNER partial unique index",
    );
    assertIncludes(
      migrationSql,
      'CREATE UNIQUE INDEX "Invitation_one_pending_per_company_email"',
      "source: one pending invitation partial unique index",
    );
    assertIncludes(
      authSource,
      'status: "ACTIVE"',
      "source: Client companyId hydrates from ACTIVE membership",
    );
    assertIncludes(
      notificationService,
      "findActiveOwnerEmail(job.companyId, db)",
      "source: T70 recipient is ACTIVE OWNER",
    );
    assertIncludes(
      shortlistEmail,
      "findActiveOwnerEmail(job.companyId, prisma)",
      "source: T70 email uses ACTIVE OWNER",
    );
    assertNotIncludes(
      notificationService,
      'role: "CLIENT"',
      "source: T70 no longer uses first CLIENT user",
    );

    // --- A: one user → one membership (V1QA) ---
    const alphaMemberships = await prisma.organizationMember.findMany({
      where: { userId: qa.clientAlpha.id, status: "ACTIVE" },
    });
    assert(
      alphaMemberships.length === 1 &&
        alphaMemberships[0]?.companyId === qa.companyAlpha.id &&
        alphaMemberships[0]?.role === "OWNER",
      "TEST A: Alpha CLIENT has exactly one ACTIVE OWNER membership",
    );

    // --- N: existing V1QA client authorization ---
    const hydratedAlpha = await hydrateAuthUser({
      ...qa.clientAlpha,
      emailVerifiedAt: new Date(),
    });
    const alphaPortal = await authorizeClientPortalAccess(hydratedAlpha);
    assert(
      alphaPortal.companyId === qa.companyAlpha.id,
      "TEST N: V1QA Alpha Client portal company is membership-derived",
    );
    const alphaJobWhere = jobScopeWhere(alphaPortal);
    assert(
      "companyId" in alphaJobWhere &&
        alphaJobWhere.companyId === qa.companyAlpha.id,
      "TEST N: jobScopeWhere still uses server-derived companyId",
    );

    // --- L / M: Interviewer and Admin have no membership ---
    assert(
      (await prisma.organizationMember.count({
        where: { userId: qa.admin.id },
      })) === 0,
      "TEST M: Admin has zero memberships",
    );
    assert(
      (await prisma.organizationMember.count({
        where: { userId: qa.interviewerAlphaUser.id },
      })) === 0,
      "TEST L: Interviewer has zero memberships",
    );
    const hydratedAdmin = await hydrateAuthUser({
      ...qa.admin,
      emailVerifiedAt: new Date(),
    });
    assert(hydratedAdmin.companyId === null, "TEST M: Admin companyId stays null");
    const hydratedInterviewer = await hydrateAuthUser({
      ...qa.interviewerAlphaUser,
      emailVerifiedAt: new Date(),
    });
    assert(
      hydratedInterviewer.companyId === null,
      "TEST L: Interviewer companyId stays null",
    );

    // --- B: multiple users → same company ---
    const memberEmail = `${EMAIL_PREFIX}-member@hireiq.local`;
    const memberUser = await createClientUser({
      email: memberEmail,
      companyId: null,
      emailVerifiedAt: null,
    });
    const invitedMember = await inviteOrganizationMemberForOwner({
      actorUserId: qa.clientAlpha.id,
      companyId: qa.companyAlpha.id,
      email: memberEmail,
    });
    const knownRawToken = "w19-known-invitation-token";
    const storedInvite = await prisma.invitation.update({
      where: { id: invitedMember.invitationId },
      data: { tokenHash: hashSecureToken(knownRawToken) },
      select: { role: true },
    });
    assert(
      storedInvite.role === OrganizationMemberRole.MEMBER,
      "TEST J: stored invitation role is MEMBER",
    );
    const memberAccepted = await acceptOrganizationInvitationForUser({
      userId: memberUser.id,
      token: knownRawToken,
    });
    assert(
      memberAccepted.companyId === qa.companyAlpha.id,
      "TEST B: second user joined Alpha",
    );
    const alphaActiveMembers = await prisma.organizationMember.count({
      where: {
        companyId: qa.companyAlpha.id,
        status: "ACTIVE",
      },
    });
    assert(alphaActiveMembers === 2, "TEST B: Alpha has OWNER + MEMBER");
    const memberRow = await prisma.organizationMember.findUniqueOrThrow({
      where: {
        companyId_userId: {
          companyId: qa.companyAlpha.id,
          userId: memberUser.id,
        },
      },
    });
    assert(
      memberRow.role === "MEMBER" && memberRow.status === "ACTIVE",
      "TEST B: invited user is ACTIVE MEMBER",
    );
    const memberProjection = await prisma.user.findUniqueOrThrow({
      where: { id: memberUser.id },
      select: { companyId: true, emailVerifiedAt: true },
    });
    assert(
      memberProjection.companyId === qa.companyAlpha.id,
      "TEST B: User.companyId projection synced",
    );
    assert(
      memberProjection.emailVerifiedAt !== null,
      "TEST B: invitation proves mailbox and sets emailVerifiedAt",
    );

    // --- C: duplicate membership rejected ---
    await assertThrows(
      () =>
        prisma.organizationMember.create({
          data: {
            companyId: qa.companyAlpha.id,
            userId: memberUser.id,
            role: "MEMBER",
            status: "ACTIVE",
          },
        }),
      (error) => isUniqueConflict(error),
      "TEST C: duplicate membership unique conflict",
    );

    // --- D: invitation cannot be reused ---
    await assertThrows(
      () =>
        acceptOrganizationInvitationForUser({
          userId: memberUser.id,
          token: knownRawToken,
        }),
      (error) =>
        error instanceof OrganizationMembershipError &&
        error.message.includes("no longer valid"),
      "TEST D: reused invitation rejected",
    );

    // --- E: expired invitation rejected ---
    const expiredEmail = `${EMAIL_PREFIX}-expired@hireiq.local`;
    const expiredUser = await createClientUser({
      email: expiredEmail,
      companyId: null,
      emailVerifiedAt: null,
    });
    const expiredInvite = await inviteOrganizationMemberForOwner({
      actorUserId: qa.clientAlpha.id,
      companyId: qa.companyAlpha.id,
      email: expiredEmail,
    });
    const expiredRaw = "w19-expired-invitation-token";
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
          userId: expiredUser.id,
          token: expiredRaw,
        }),
      (error) =>
        error instanceof OrganizationMembershipError &&
        error.message.includes("expired"),
      "TEST E: expired invitation rejected",
    );

    // --- F: revoked invitation rejected ---
    const revokedEmail = `${EMAIL_PREFIX}-revoked@hireiq.local`;
    const revokedUser = await createClientUser({
      email: revokedEmail,
      companyId: null,
      emailVerifiedAt: null,
    });
    const revokedInvite = await inviteOrganizationMemberForOwner({
      actorUserId: qa.clientAlpha.id,
      companyId: qa.companyAlpha.id,
      email: revokedEmail,
    });
    await revokeOrganizationInvitationForOwner({
      actorUserId: qa.clientAlpha.id,
      companyId: qa.companyAlpha.id,
      invitationId: revokedInvite.invitationId,
    });
    const revokedRaw = "w19-revoked-invitation-token";
    await prisma.invitation.update({
      where: { id: revokedInvite.invitationId },
      data: { tokenHash: hashSecureToken(revokedRaw) },
    });
    const revokedRow = await prisma.invitation.findUniqueOrThrow({
      where: { id: revokedInvite.invitationId },
    });
    assert(revokedRow.revokedAt !== null, "TEST F: invitation row retained");
    await assertThrows(
      () =>
        acceptOrganizationInvitationForUser({
          userId: revokedUser.id,
          token: revokedRaw,
        }),
      (error) =>
        error instanceof OrganizationMembershipError &&
        error.message.includes("no longer valid"),
      "TEST F: revoked invitation rejected",
    );

    // --- G: wrong email rejected ---
    const wrongEmail = `${EMAIL_PREFIX}-wrong@hireiq.local`;
    const wrongUser = await createClientUser({
      email: wrongEmail,
      companyId: null,
      emailVerifiedAt: null,
    });
    const intendedEmail = `${EMAIL_PREFIX}-intended@hireiq.local`;
    await createClientUser({
      email: intendedEmail,
      companyId: null,
      emailVerifiedAt: null,
    });
    const intendedInvite = await inviteOrganizationMemberForOwner({
      actorUserId: qa.clientAlpha.id,
      companyId: qa.companyAlpha.id,
      email: intendedEmail,
    });
    const intendedRaw = "w19-wrong-email-invitation-token";
    await prisma.invitation.update({
      where: { id: intendedInvite.invitationId },
      data: { tokenHash: hashSecureToken(intendedRaw) },
    });
    await assertThrows(
      () =>
        acceptOrganizationInvitationForUser({
          userId: wrongUser.id,
          token: intendedRaw,
        }),
      (error) =>
        error instanceof OrganizationMembershipError &&
        error.message.includes("different email"),
      "TEST G: wrong email cannot accept",
    );

    // --- H / O: tenant isolation ---
    await assertThrows(
      () =>
        inviteOrganizationMemberForOwner({
          actorUserId: qa.clientBeta.id,
          companyId: qa.companyAlpha.id,
          email: `${EMAIL_PREFIX}-cross@hireiq.local`,
        }),
      (error) =>
        error instanceof OrganizationMembershipError &&
        error.message.includes("Unauthorized"),
      "TEST H: Beta OWNER cannot invite into Alpha",
    );
    await assertThrows(
      () => assertClientCompanyAccess(qa.clientAlpha, qa.companyBeta.id),
      (error) => error instanceof AuthorizationError,
      "TEST O: Alpha Client denied Beta company",
    );
    const betaJobWhere = jobScopeWhere(qa.clientBeta);
    assert(
      "companyId" in betaJobWhere &&
        betaJobWhere.companyId === qa.companyBeta.id,
      "TEST O: Beta scope stays on Beta",
    );
    const memberHydrated = await hydrateAuthUser({
      ...memberUser,
      companyId: qa.companyAlpha.id,
      emailVerifiedAt: memberProjection.emailVerifiedAt,
    });
    assert(
      memberHydrated.companyId === qa.companyAlpha.id,
      "TEST H: member hydrates to Alpha only",
    );
    await assertThrows(
      () =>
        hydrateAuthUser({
          ...memberUser,
          companyId: qa.companyBeta.id,
          emailVerifiedAt: memberProjection.emailVerifiedAt,
        }),
      (error) => error instanceof AuthorizationError,
      "TEST H: projection mismatch with Beta companyId fails closed",
    );

    // --- I: browser/request membershipId ignored ---
    assertIncludes(
      orgActions,
      "export async function acceptOrganizationInvitation(token: unknown)",
      "TEST I: accept input is token only",
    );
    assertIncludes(
      invitationService,
      "acceptOrganizationInvitationForUser(input: {\n  userId: number;\n  token: unknown;\n})",
      "TEST I: accept service input is userId + token only",
    );

    // --- J: invite role cannot become OWNER ---
    const ownerAttemptEmail = `${EMAIL_PREFIX}-owner-role@hireiq.local`;
    const ownerAttemptUser = await createClientUser({
      email: ownerAttemptEmail,
      companyId: null,
      emailVerifiedAt: null,
    });
    const ownerAttemptInvite = await inviteOrganizationMemberForOwner({
      actorUserId: qa.clientAlpha.id,
      companyId: qa.companyAlpha.id,
      email: ownerAttemptEmail,
    });
    await prisma.invitation.update({
      where: { id: ownerAttemptInvite.invitationId },
      data: {
        role: OrganizationMemberRole.OWNER,
        tokenHash: hashSecureToken("w19-owner-role-token"),
      },
    });
    await assertThrows(
      () =>
        acceptOrganizationInvitationForUser({
          userId: ownerAttemptUser.id,
          token: "w19-owner-role-token",
        }),
      (error) =>
        error instanceof OrganizationMembershipError &&
        error.message.includes("cannot create an owner"),
      "TEST J: invitation role OWNER cannot be accepted",
    );

    // --- K: invite cannot create ADMIN ---
    await assertThrows(
      () =>
        inviteOrganizationMemberForOwner({
          actorUserId: qa.clientAlpha.id,
          companyId: qa.companyAlpha.id,
          email: qa.admin.email,
        }),
      (error) =>
        error instanceof OrganizationMembershipError &&
        error.message.includes("cannot be invited"),
      "TEST K: Admin email cannot be invited",
    );
    await assertThrows(
      () =>
        inviteOrganizationMemberForOwner({
          actorUserId: qa.clientAlpha.id,
          companyId: qa.companyAlpha.id,
          email: qa.interviewerAlphaUser.email,
        }),
      (error) =>
        error instanceof OrganizationMembershipError &&
        error.message.includes("cannot be invited"),
      "TEST K: Interviewer email cannot be invited",
    );

    // --- P: concurrent invitation acceptance ---
    const concurrentEmail = `${EMAIL_PREFIX}-concurrent@hireiq.local`;
    const concurrentUser = await createClientUser({
      email: concurrentEmail,
      companyId: null,
      emailVerifiedAt: null,
    });
    const concurrentInvite = await inviteOrganizationMemberForOwner({
      actorUserId: qa.clientAlpha.id,
      companyId: qa.companyAlpha.id,
      email: concurrentEmail,
    });
    const concurrentRaw = "w19-concurrent-accept-token";
    await prisma.invitation.update({
      where: { id: concurrentInvite.invitationId },
      data: { tokenHash: hashSecureToken(concurrentRaw) },
    });
    const concurrentResults = await Promise.allSettled([
      acceptOrganizationInvitationForUser({
        userId: concurrentUser.id,
        token: concurrentRaw,
      }),
      acceptOrganizationInvitationForUser({
        userId: concurrentUser.id,
        token: concurrentRaw,
      }),
    ]);
    const concurrentFulfilled = concurrentResults.filter(
      (result) => result.status === "fulfilled",
    );
    const concurrentRejected = concurrentResults.filter(
      (result) => result.status === "rejected",
    );
    assert(
      concurrentFulfilled.length === 1,
      "TEST P: exactly one concurrent accept succeeds",
    );
    assert(
      concurrentRejected.length === 1,
      "TEST P: the other concurrent accept fails closed",
    );
    assert(
      (await prisma.organizationMember.count({
        where: { userId: concurrentUser.id, status: "ACTIVE" },
      })) === 1,
      "TEST P: only one membership created",
    );

    // --- Q: concurrent membership creation ---
    const raceEmail = `${EMAIL_PREFIX}-race@hireiq.local`;
    const raceUser = await createClientUser({
      email: raceEmail,
      companyId: qa.companyBeta.id,
      emailVerifiedAt: new Date(),
    });
    const raceCreates = await Promise.allSettled([
      prisma.organizationMember.create({
        data: {
          companyId: qa.companyBeta.id,
          userId: raceUser.id,
          role: "MEMBER",
          status: "ACTIVE",
        },
      }),
      prisma.organizationMember.create({
        data: {
          companyId: qa.companyBeta.id,
          userId: raceUser.id,
          role: "MEMBER",
          status: "ACTIVE",
        },
      }),
    ]);
    const raceOk = raceCreates.filter((result) => result.status === "fulfilled");
    const raceConflict = raceCreates.filter(
      (result) =>
        result.status === "rejected" && isUniqueConflict(result.reason),
    );
    assert(raceOk.length === 1, "TEST Q: one membership create succeeds");
    assert(raceConflict.length === 1, "TEST Q: duplicate create is P2002");

    // --- R: verification token single use ---
    const verifyUser = await createClientUser({
      email: `${EMAIL_PREFIX}-verify@hireiq.local`,
      companyId: qa.companyAlpha.id,
      emailVerifiedAt: null,
    });
    await prisma.organizationMember.create({
      data: {
        companyId: qa.companyAlpha.id,
        userId: verifyUser.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });
    const issued = await issueEmailVerificationTokenForUser({
      userId: verifyUser.id,
    });
    const verified = await consumeEmailVerificationTokenForUser({
      userId: verifyUser.id,
      token: issued.rawToken,
    });
    assert(verified.verified === true, "TEST R: verification consumes once");
    await assertThrows(
      () =>
        consumeEmailVerificationTokenForUser({
          userId: verifyUser.id,
          token: issued.rawToken,
        }),
      (error) =>
        error instanceof OrganizationMembershipError &&
        error.message.includes("no longer valid"),
      "TEST R: replay rejected",
    );

    // --- S: verification token expiry ---
    const expiredVerifyUser = await createClientUser({
      email: `${EMAIL_PREFIX}-verify-exp@hireiq.local`,
      companyId: null,
      emailVerifiedAt: null,
    });
    const expiredIssued = await issueEmailVerificationTokenForUser({
      userId: expiredVerifyUser.id,
    });
    await prisma.emailVerificationToken.update({
      where: { id: expiredIssued.tokenId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await assertThrows(
      () =>
        consumeEmailVerificationTokenForUser({
          userId: expiredVerifyUser.id,
          token: expiredIssued.rawToken,
        }),
      (error) =>
        error instanceof OrganizationMembershipError &&
        error.message.includes("expired"),
      "TEST S: expired verification token rejected",
    );

    // --- T: unverified client denied ---
    const unverified = await createClientUser({
      email: `${EMAIL_PREFIX}-unverified@hireiq.local`,
      companyId: qa.companyAlpha.id,
      emailVerifiedAt: null,
    });
    await prisma.organizationMember.create({
      data: {
        companyId: qa.companyAlpha.id,
        userId: unverified.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });
    const unverifiedHydrated = await hydrateAuthUser(unverified);
    await assertThrows(
      () => authorizeClientPortalAccess(unverifiedHydrated),
      (error) => error instanceof AuthorizationError,
      "TEST T: unverified Client denied portal",
    );

    // projection mismatch fails closed
    const mismatchUser = await createClientUser({
      email: `${EMAIL_PREFIX}-mismatch@hireiq.local`,
      companyId: qa.companyBeta.id,
      emailVerifiedAt: new Date(),
    });
    await prisma.organizationMember.create({
      data: {
        companyId: qa.companyAlpha.id,
        userId: mismatchUser.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });
    await assertThrows(
      () => hydrateAuthUser(mismatchUser),
      (error) => error instanceof AuthorizationError,
      "projection mismatch fails closed",
    );

    // suspended / removed not authorized
    await prisma.organizationMember.update({
      where: {
        companyId_userId: {
          companyId: qa.companyAlpha.id,
          userId: memberUser.id,
        },
      },
      data: { status: OrganizationMemberStatus.SUSPENDED },
    });
    const suspendedHydrated = await hydrateAuthUser({
      ...memberUser,
      companyId: qa.companyAlpha.id,
      emailVerifiedAt: new Date(),
    });
    assert(
      suspendedHydrated.companyId === null,
      "suspended member is not authorized",
    );
    await prisma.organizationMember.update({
      where: {
        companyId_userId: {
          companyId: qa.companyAlpha.id,
          userId: memberUser.id,
        },
      },
      data: { status: OrganizationMemberStatus.REMOVED },
    });
    const removedHydrated = await hydrateAuthUser({
      ...memberUser,
      companyId: qa.companyAlpha.id,
      emailVerifiedAt: new Date(),
    });
    assert(
      removedHydrated.companyId === null,
      "removed member is not authorized",
    );

    const ownerRecipient = await resolveOwningClientRecipient(
      (
        await prisma.job.findFirstOrThrow({
          where: { companyId: qa.companyAlpha.id },
          select: { id: true },
        })
      ).id,
    );
    assert(
      ownerRecipient.email === qa.clientAlpha.email,
      "T70 OWNER recipient is Alpha OWNER, not an arbitrary CLIENT",
    );

    // invitation replacement: one pending per company+email
    const replaceEmail = `${EMAIL_PREFIX}-replace@hireiq.local`;
    const firstReplace = await inviteOrganizationMemberForOwner({
      actorUserId: qa.clientAlpha.id,
      companyId: qa.companyAlpha.id,
      email: replaceEmail,
    });
    const secondReplace = await inviteOrganizationMemberForOwner({
      actorUserId: qa.clientAlpha.id,
      companyId: qa.companyAlpha.id,
      email: replaceEmail,
    });
    assert(
      secondReplace.replacedPendingInvitation === true,
      "replacement revokes the previous pending invitation",
    );
    const pendingCount = await prisma.invitation.count({
      where: {
        companyId: qa.companyAlpha.id,
        email: replaceEmail,
        acceptedAt: null,
        revokedAt: null,
      },
    });
    assert(pendingCount === 1, "only one pending invitation remains");
    const firstReplaceRow = await prisma.invitation.findUniqueOrThrow({
      where: { id: firstReplace.invitationId },
    });
    assert(firstReplaceRow.revokedAt !== null, "old invitation is revoked");
  } finally {
    await cleanupW19();
  }
}
