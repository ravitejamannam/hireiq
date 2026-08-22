import { prisma } from "../lib/prisma";
import { upsertAssessmentBank } from "../lib/assessments/assessment-service";

async function main() {
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
