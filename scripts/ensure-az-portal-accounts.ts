/**
 * Ensure the two portal logins used by scripts/az-regression.sh.
 *
 * Dry run is the default and writes nothing. Apply with FIXTURE_APPLY=1.
 * Does not read DATABASE_URL from the environment or from .env.
 *
 * Usage:
 *   AZ_DATABASE_URL=... AZ_E2E_PORTAL_PASSWORD=... \
 *     pnpm exec tsx scripts/ensure-az-portal-accounts.ts
 */
const PORTAL_COMPANY_ID = 1;
const OWNER_EMAIL = "owner.nimbus@hireiq.local";
const INTERVIEWER_EMAIL = "interviewer.arjun@hireiq.local";
const PORTAL_FIXTURE_LOCK = 143004;
const PORTAL_MIN_PASSWORD_LENGTH = 8;

function requireE2eDatabaseName(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("AZ_DATABASE_URL is not a valid database URL.");
  }
  const name = url.pathname.replace(/^\//, "").split("/")[0] ?? "";
  if (name !== "hireiq_e2e") {
    throw new Error("AZ_DATABASE_URL must use the hireiq_e2e database.");
  }
}

async function ensureAzPortalAccounts() {
  const databaseUrl = process.env.AZ_DATABASE_URL?.trim();
  const password = process.env.AZ_E2E_PORTAL_PASSWORD;
  if (!databaseUrl) throw new Error("AZ_DATABASE_URL is required.");
  if (!password || password.length < PORTAL_MIN_PASSWORD_LENGTH) {
    throw new Error("AZ_E2E_PORTAL_PASSWORD must be at least 8 characters.");
  }
  requireE2eDatabaseName(databaseUrl);
  const apply = process.env.FIXTURE_APPLY === "1";
  process.env.DATABASE_URL = databaseUrl;

  const { prisma } = await import("@/lib/prisma");
  const { hashPassword } = await import("@/lib/auth/password");
  const { clientFixtureIsReady, interviewerFixtureIsReady, AZ_CLIENT_MEMBERSHIP_ROLE } = await import(
    "@/lib/auth/az-portal-fixtures"
  );

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PORTAL_FIXTURE_LOCK})`;
      const company = await tx.company.findUnique({
        where: { id: PORTAL_COMPANY_ID },
        select: { id: true },
      });
      if (!company) throw new Error("Company 1 does not exist.");

      const owner = await tx.user.findUnique({
        where: { email: OWNER_EMAIL },
        select: {
          id: true,
          role: true,
          disabledAt: true,
          emailVerifiedAt: true,
          companyId: true,
          organizationMemberships: {
            where: { status: "ACTIVE" },
            select: { companyId: true },
          },
        },
      });
      const interviewerUser = await tx.user.findUnique({
        where: { email: INTERVIEWER_EMAIL },
        select: { id: true, role: true, disabledAt: true, interviewerId: true },
      });

      if (owner && !clientFixtureIsReady({
        role: owner.role,
        disabledAt: owner.disabledAt,
        emailVerifiedAt: owner.emailVerifiedAt,
        companyId: owner.companyId,
        activeMembershipCompanyIds: owner.organizationMemberships.map((row) => row.companyId),
      }, PORTAL_COMPANY_ID)) {
        throw new Error("owner.nimbus@hireiq.local exists but is not an eligible client. Refusing to change it.");
      }
      if (interviewerUser && !interviewerFixtureIsReady(interviewerUser)) {
        throw new Error("interviewer.arjun@hireiq.local exists but is not an eligible interviewer. Refusing to change it.");
      }
      if (owner && interviewerUser) return "kept" as const;
      if (!apply) return "would-create" as const;

      const passwordHash = await hashPassword(password);
      if (!owner) {
        const created = await tx.user.create({
          data: {
            email: OWNER_EMAIL,
            name: "Nimbus Owner",
            role: "CLIENT",
            passwordHash,
            emailVerifiedAt: new Date(),
            companyId: PORTAL_COMPANY_ID,
          },
          select: { id: true },
        });
        await tx.organizationMember.create({
          data: {
            companyId: PORTAL_COMPANY_ID,
            userId: created.id,
            role: AZ_CLIENT_MEMBERSHIP_ROLE,
            status: "ACTIVE",
          },
        });
      }
      if (!interviewerUser) {
        const profile = await tx.interviewer.create({
          data: { name: "Arjun", category: "ENGINEERING" },
          select: { id: true },
        });
        await tx.user.create({
          data: {
            email: INTERVIEWER_EMAIL,
            name: "Arjun",
            role: "INTERVIEWER",
            passwordHash,
            interviewerId: profile.id,
          },
        });
      }
      return "created" as const;
    });
    console.info(JSON.stringify({
      event: "az_portal_accounts",
      action: result,
      companyId: PORTAL_COMPANY_ID,
      apply,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

ensureAzPortalAccounts().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Portal fixture failed.");
  process.exitCode = 1;
});
