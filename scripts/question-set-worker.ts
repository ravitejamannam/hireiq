/**
 * Test worker for question-set concurrency. Each process has its own Prisma client and
 * connection pool, so several of them against one Postgres stand in for separate app
 * instances. Local database only; never started by the app.
 */
import { Prisma } from "@prisma/client";

import { sendAssessmentLink } from "@/lib/assessments/generated-assessment-service";
import { prisma } from "@/lib/prisma";
import { assertE2eDatabase } from "@/lib/testing/e2e-database-guard";

type Job =
  | { mode: "send"; companyId: number; actorUserId: number; applicationIds: number[] }
  | { mode: "hold"; assessmentId: number; applicationId: number };

async function main() {
  assertE2eDatabase();
  const job = JSON.parse(process.argv[2] ?? "{}") as Job;
  if (job.mode === "send") {
    const results: Array<{ applicationId: number; inviteId: number; reused: boolean; uniqueSet: boolean }> = [];
    await Promise.all(
      job.applicationIds.map(async (applicationId) => {
        const link = await sendAssessmentLink({ applicationId, actorUserId: job.actorUserId, companyId: job.companyId });
        results.push({ applicationId, inviteId: link.inviteId, reused: link.reused, uniqueSet: link.uniqueSet });
      }),
    );
    process.stdout.write(`RESULT ${JSON.stringify(results)}\n`);
  } else {
    // Takes the same lock as sendAssessmentLink, writes an invite, and never commits.
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(918274, ${job.assessmentId}::int)`);
        await tx.generatedAssessmentInvite.create({
          data: {
            applicationId: job.applicationId,
            assessmentId: job.assessmentId,
            tokenHash: `held-${process.pid}-${Date.now()}`,
            itemOrder: ["held"],
            expiresAt: new Date(Date.now() + 60_000),
          },
        });
        process.stdout.write("LOCKED\n");
        await new Promise((resolve) => setTimeout(resolve, 120_000));
      },
      { timeout: 150_000, maxWait: 150_000 },
    );
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
