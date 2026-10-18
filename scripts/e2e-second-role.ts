import { createPostedRequirementForCompany } from "@/lib/jobs/posted-requirement";
import { prisma } from "@/lib/prisma";
import { runTalentRediscovery } from "@/lib/talent/rediscovery-service";

async function main() {
  if (!process.env.DATABASE_URL?.includes("hireiq_e2e_full")) throw new Error("wrong database");
  const company = await prisma.company.findFirstOrThrow({ where: { publicSlug: "e2e-nimbus" } });
  const admin = await prisma.user.findFirstOrThrow({ where: { email: "admin.nimbus@e2e.hireiq.local" } });
  const source = await prisma.job.findFirstOrThrow({
    where: { companyId: company.id, title: { contains: "Backend Engineer" } },
    select: { id: true, assignedInterviewerId: true },
  });
  const second = await createPostedRequirementForCompany({
    companyId: company.id,
    createdByUserId: admin.id,
    title: "Nimbus Labs: Backend Engineer II",
    clientCreateIdempotencyKey: `e2e-nimbus-backend-2-${Date.now()}`,
    fields: {
      roleCategory: "ENGINEERING",
      experienceRange: "5-9",
      location: "Bengaluru",
      primarySkills: "Go, PostgreSQL, Kubernetes",
      mustHaveRequirements: "5 years backend systems",
      niceToHaveRequirements: "gRPC",
      jobDescription: "Second backend role at Nimbus Labs.",
      evaluationCriteria: "Resume evidence.",
      compensationRange: "12-24 LPA",
      targetHireDate: new Date("2026-12-15T00:00:00.000Z"),
      numberOfPositions: 1,
    },
  });
  await prisma.job.update({ where: { id: second.id }, data: { assignedInterviewerId: source.assignedInterviewerId } });

  const applications = await prisma.application.findMany({
    where: { jobId: source.id, companyId: company.id },
    select: { id: true, candidateId: true, futureRolesConsent: true, aiEvaluationOptOut: true },
  });
  let evidence = 0;
  for (const application of applications) {
    const existing = await prisma.candidateEvidence.count({
      where: { candidateId: application.candidateId, companyId: company.id, revokedAt: null, inlineText: { not: "" } },
    });
    if (existing === 0) {
      await prisma.candidateEvidence.create({
        data: {
          companyId: company.id,
          candidateId: application.candidateId,
          applicationId: application.id,
          sourceType: "RECRUITER_ENTERED_TEXT",
          origin: "RECRUITER_ENTERED",
          inlineText: "Backend engineer. Go, PostgreSQL, and Kubernetes in production for six years.",
        },
      });
      evidence += 1;
    }
  }
  const ranked = await runTalentRediscovery({ jobId: second.id });
  console.log(JSON.stringify({
    secondJobId: second.id,
    sourceApplications: applications.length,
    evidenceAdded: evidence,
    pastCandidates: ranked.length,
    names: ranked.slice(0, 5).map((row) => row.name),
  }));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
