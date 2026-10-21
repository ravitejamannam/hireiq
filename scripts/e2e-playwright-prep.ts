import { assertE2eDatabase } from "@/lib/testing/e2e-database-guard";
import { hashPassword } from "@/lib/auth/password";
import { issuePortalLink } from "@/lib/portal/portal-service";
import { prisma } from "@/lib/prisma";
import { writeFileSync } from "node:fs";

async function main() {
  assertE2eDatabase();
  const company = await prisma.company.findFirstOrThrow({ where: { publicSlug: "e2e-nimbus" } });
  const other = await prisma.company.findFirstOrThrow({ where: { publicSlug: "e2e-kaveri" } });
  const password = "E2e-full-test-pass-1";
  const passwordHash = await hashPassword(password);
  const email = "company.admin.nimbus@e2e.hireiq.local";
  const admin = await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN", companyId: company.id, passwordHash, emailVerifiedAt: new Date(), disabledAt: null },
    create: {
      email,
      name: "Nimbus company admin",
      role: "ADMIN",
      companyId: company.id,
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.organizationMember.upsert({
    where: { companyId_userId: { companyId: company.id, userId: admin.id } },
    update: { role: "MEMBER", status: "ACTIVE" },
    create: { companyId: company.id, userId: admin.id, role: "MEMBER", status: "ACTIVE" },
  });
  const job = await prisma.job.findFirstOrThrow({ where: { companyId: company.id, title: { contains: "Backend Engineer II" } } });
  const source = await prisma.job.findFirstOrThrow({ where: { companyId: company.id, title: "Nimbus Labs: Backend Engineer" } });
  const otherJob = await prisma.job.findFirstOrThrow({ where: { companyId: other.id, title: { contains: "Backend" } } });
  const application = await prisma.application.findFirstOrThrow({
    where: { jobId: source.id, companyId: company.id },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const interviewer = await prisma.user.findFirstOrThrow({ where: { email: "interviewer1.nimbus@e2e.hireiq.local" } });
  // Same company, different interviewer: a job assigned to interviewer 2 with one ordinary application, so the
  // assignment rule can be tested on its own (interviewer 1 is a member of this company's tenant but not assigned).
  const interviewerTwo = await prisma.user.findFirstOrThrow({ where: { email: "interviewer2.nimbus@e2e.hireiq.local" } });
  const assignedElsewhere = await prisma.job.findFirstOrThrow({
    where: { companyId: company.id, assignedInterviewerId: interviewerTwo.interviewerId! },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  const otherInterviewerCandidate = await prisma.candidate.create({
    data: { companyId: company.id, name: "Assigned Elsewhere Applicant", role: "Engineer", experienceYears: 4, status: "APPLIED" },
  });
  const otherInterviewerApplication = await prisma.application.create({
    data: { candidateId: otherInterviewerCandidate.id, jobId: assignedElsewhere.id, companyId: company.id },
  });
  const portal = await issuePortalLink("shared.person@example.com", "http://localhost:4001");
  writeFileSync("/tmp/hireiq-playwright.json", JSON.stringify({
    adminEmail: email,
    interviewerEmail: interviewer.email,
    password,
    reviewJobId: source.id,
    secondJobId: job.id,
    otherJobId: otherJob.id,
    applicationId: application.id,
    otherInterviewerEmail: interviewerTwo.email,
    otherInterviewerJobId: assignedElsewhere.id,
    otherInterviewerApplicationId: otherInterviewerApplication.id,
    portalUrl: portal?.url ?? null,
  }, null, 2));
  console.log("prepared", portal?.url ? "portal" : "no-portal");
  await prisma.$disconnect();
}

main();
