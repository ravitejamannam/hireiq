/**
 * Ensure company 1 / job 3 has one published hosted apply link.
 *
 * Dry run is the default and writes nothing. Apply with FIXTURE_APPLY=1.
 * Pass the database and origin explicitly. This script does not read
 * DATABASE_URL from the environment or from .env.
 *
 * Usage:
 *   AZ_E2E_DATABASE_URL=... AZ_E2E_APP_URL=http://localhost:4010 \
 *     pnpm exec tsx scripts/ensure-az-hosted-apply.ts
 *   FIXTURE_APPLY=1 to create the link when none exists.
 */
const COMPANY_ID = 1;
const JOB_ID = 3;
const SPEC_ID = 1;
const FIXTURE_LOCK = 143003;

function databaseName(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("AZ_E2E_DATABASE_URL is not a valid database URL.");
  }
  const name = url.pathname.replace(/^\//, "").split("/")[0] ?? "";
  if (name !== "hireiq_e2e") {
    throw new Error("AZ_E2E_DATABASE_URL must use the hireiq_e2e database.");
  }
  return name;
}

function appOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("AZ_E2E_APP_URL is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("AZ_E2E_APP_URL must be an http(s) origin.");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("AZ_E2E_APP_URL must be an origin with no path.");
  }
  return url.origin;
}

async function main() {
  const databaseUrl = process.env.AZ_E2E_DATABASE_URL?.trim();
  const appUrl = process.env.AZ_E2E_APP_URL?.trim();
  if (!databaseUrl) {
    throw new Error("AZ_E2E_DATABASE_URL is required.");
  }
  if (!appUrl) {
    throw new Error("AZ_E2E_APP_URL is required.");
  }
  databaseName(databaseUrl);
  const origin = appOrigin(appUrl);
  const apply = process.env.FIXTURE_APPLY === "1";

  process.env.DATABASE_URL = databaseUrl;
  process.env.APP_URL = origin;

  const { prisma } = await import("@/lib/prisma");
  const {
    hostedApplyTokenFromSnapshot,
    mintHostedApplyTokenMaterial,
  } = await import("@/lib/apply/apply-token");
  const { hostedApplyFixtureIsConsistent } = await import(
    "@/lib/apply/az-hosted-apply-fixture"
  );

  const where = {
    companyId: COMPANY_ID,
    jobId: JOB_ID,
    applyMode: "HIREIQ_HOSTED" as const,
    status: "PUBLISHED" as const,
    applyUrlSnapshot: { not: null },
  };

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${FIXTURE_LOCK})`;
      const job = await tx.job.findFirst({
        where: {
          id: JOB_ID,
          companyId: COMPANY_ID,
          status: "OPEN",
          currentPublishedSpecificationVersionId: SPEC_ID,
        },
        select: { id: true },
      });
      if (!job) {
        throw new Error("Job 3 is not an open company 1 job pinned to specification 1.");
      }
      const spec = await tx.jobSpecificationVersion.findFirst({
        where: { id: SPEC_ID, jobId: JOB_ID, status: "PUBLISHED" },
        select: { id: true },
      });
      if (!spec) {
        throw new Error("Specification 1 is not a published specification for job 3.");
      }

      const existing = await tx.jobDistribution.findMany({
        where,
        select: { id: true, applyUrlSnapshot: true },
      });
      if (existing.length > 1) {
        throw new Error(
          `Job 3 has ${existing.length} published hosted apply links. Refusing to change them.`,
        );
      }
      if (existing.length === 1) {
        const snapshot = existing[0].applyUrlSnapshot;
        const live = await tx.applyToken.findMany({
          where: { distributionId: existing[0].id, revokedAt: null },
          select: { tokenHash: true },
        });
        if (
          !snapshot ||
          !hostedApplyFixtureIsConsistent({
            snapshot,
            origin,
            unrevokedTokenHashes: live.map((row) => row.tokenHash),
          })
        ) {
          throw new Error(
            "Job 3 hosted apply link does not match its unrevoked token. Refusing to change it.",
          );
        }
        return "kept" as const;
      }
      if (!apply) {
        return "would-create" as const;
      }

      const minted = mintHostedApplyTokenMaterial();
      const raw = hostedApplyTokenFromSnapshot(minted.applyUrl);
      if (
        !raw ||
        !hostedApplyFixtureIsConsistent({
          snapshot: minted.applyUrl,
          origin,
          unrevokedTokenHashes: [minted.tokenHash],
        })
      ) {
        throw new Error("Minted hosted apply link did not match the requested origin.");
      }
      const distribution = await tx.jobDistribution.create({
        data: {
          companyId: COMPANY_ID,
          jobId: JOB_ID,
          jobSpecificationVersionId: SPEC_ID,
          provider: "MANUAL",
          applyMode: "HIREIQ_HOSTED",
          status: "PUBLISHED",
          applyUrlSnapshot: minted.applyUrl,
        },
        select: { id: true },
      });
      await tx.applyToken.create({
        data: {
          distributionId: distribution.id,
          tokenHash: minted.tokenHash,
        },
      });
      return "created" as const;
    });

    console.info(
      JSON.stringify({
        event: "az_hosted_apply_fixture",
        action: result,
        companyId: COMPANY_ID,
        jobId: JOB_ID,
        specificationId: SPEC_ID,
        apply,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Hosted apply fixture failed.";
  console.error(message);
  process.exitCode = 1;
});
