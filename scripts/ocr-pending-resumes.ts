/**
 * Same work as GET /api/ops/resume-ocr. The schedule is the cron route.
 *
 * Usage: pnpm exec tsx scripts/ocr-pending-resumes.ts
 * Optional: the script stops after about 45 seconds.
 */
import { prisma } from "@/lib/prisma";
import { processPendingResumeOcr } from "@/lib/resumes/ocr-queue";

async function main() {
  const deadlineAt = Date.now() + 45_000;
  await processPendingResumeOcr({ deadlineAt });
}

main()
  .catch((error) => {
    console.error("[ocr-pending-resumes] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
