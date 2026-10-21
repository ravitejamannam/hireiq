import { prisma } from "../lib/prisma";
import { upsertAssessmentBank } from "../lib/assessments/assessment-service";
import { assertE2eDatabase } from "../lib/testing/e2e-database-guard";

// This script loads no .env file: DATABASE_URL and E2E_DATABASE_NAME must be set explicitly in the environment.
async function main() {
  assertE2eDatabase();
  await upsertAssessmentBank(prisma);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
