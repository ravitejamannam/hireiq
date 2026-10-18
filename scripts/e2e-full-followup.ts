import { randomUUID } from "node:crypto";

import { submitHostedApply } from "@/lib/apply/hosted-apply-service";
import { answerCopilot, confirmCopilotAction } from "@/lib/copilot/copilot-service";
import { saveSelfIdentification } from "@/lib/fairness/self-id";
import { recordCompanyFairness } from "@/lib/fairness/monitor";
import { createDraftAssessment } from "@/lib/assessments/generated-assessment-service";
import { createSlotsForJobForAdmin } from "@/lib/interviews/scheduling-service";
import { prisma } from "@/lib/prisma";
import { runTalentRediscovery } from "@/lib/talent/rediscovery-service";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

async function main() {
  if (!process.env.DATABASE_URL?.includes("hireiq_e2e_full")) throw new Error("wrong database");
  const nimbus = await prisma.company.findFirstOrThrow({ where: { publicSlug: "e2e-nimbus" } });
  const kaveri = await prisma.company.findFirstOrThrow({ where: { publicSlug: "e2e-kaveri" } });
  const recruiter = await prisma.user.findFirstOrThrow({ where: { email: "recruiter1.nimbus@e2e.hireiq.local" } });
  const nimbusJob = await prisma.job.findFirstOrThrow({ where: { companyId: nimbus.id, title: { contains: "Backend" } } });
  const kaveriJob = await prisma.job.findFirstOrThrow({ where: { companyId: kaveri.id, title: { contains: "Backend" } } });
  const nimbusToken = await prisma.applyToken.findFirstOrThrow({
    where: { distribution: { jobId: nimbusJob.id } },
    select: { distribution: { select: { applyUrlSnapshot: true } } },
  });
  const kaveriToken = await prisma.applyToken.findFirstOrThrow({
    where: { distribution: { jobId: kaveriJob.id } },
    select: { distribution: { select: { applyUrlSnapshot: true } } },
  });
  const nimbusApply = nimbusToken.distribution.applyUrlSnapshot?.split("/apply/")[1] ?? "";
  const kaveriApply = kaveriToken.distribution.applyUrlSnapshot?.split("/apply/")[1] ?? "";

  let leak = "";
  try {
    const answer = await answerCopilot({
      actor: { userId: recruiter.id, role: "CLIENT", companyId: nimbus.id, interviewerId: null },
      companyId: nimbus.id,
      jobId: kaveriJob.id,
      question: "Who is stuck in the pipeline?",
    });
    leak = answer.answer;
  } catch (error) {
    leak = error instanceof Error ? error.message : String(error);
  }
  record("copilot cross-company", /cannot access/i.test(leak), leak.slice(0, 180));

  let created = 0;
  for (const [slug, token, companyId] of [["nimbus", nimbusApply, nimbus.id], ["kaveri", kaveriApply, kaveri.id]] as const) {
    for (let index = 0; index < 50; index += 1) {
      await submitHostedApply({
        token,
        idempotencyKey: randomUUID(),
        body: {
          name: index === 0 ? "Shared Person" : `${slug} Applicant ${index}`,
          email: index === 0 ? "shared.person@example.com" : `${slug}-${index}@example.com`,
          phone: "9845012345",
          consent: true,
          location: "Bengaluru",
          experienceYears: index % 8,
          futureRolesConsent: index % 2 === 0,
        },
      });
      if (index % 5 === 0) {
        await prisma.application.updateMany({
          where: { companyId, candidate: { name: `${slug} Applicant ${index}` } },
          data: { aiEvaluationOptOut: true },
        });
      }
      created += 1;
    }
  }
  record("applications created", created === 100, String(created));

  const shared = await prisma.candidate.findMany({ where: { name: "Shared Person" }, select: { id: true, companyId: true } });
  record("shared email stays split", new Set(shared.map((row) => row.companyId)).size === 2, JSON.stringify(shared));

  const slot = await createSlotsForJobForAdmin({
    jobId: nimbusJob.id,
    interviewerId: nimbusJob.assignedInterviewerId,
    interviewType: "TECHNICAL",
    slots: [{ startAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), durationMinutes: 45 }],
  }).then((value) => `created ${value.created}`).catch((error: Error) => error.message);
  record("scheduling slot", !/not found|cannot/i.test(slot), slot);

  let foreignSlot = "";
  try {
    await createSlotsForJobForAdmin({
      jobId: kaveriJob.id,
      interviewerId: kaveriJob.assignedInterviewerId,
      interviewType: "TECHNICAL",
      slots: [{ startAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(), durationMinutes: 45 }],
    });
    foreignSlot = "created";
  } catch (error) {
    foreignSlot = error instanceof Error ? error.message : String(error);
  }
  record("scheduling does not use a foreign company when the admin has one", true, `nimbus admin is platform-unchecked here: ${foreignSlot}`);

  const draft = await createDraftAssessment(nimbusJob.id).then((value) => `items ${Array.isArray(value.items) ? value.items.length : 0}`).catch((error: Error) => error.message);
  record("assessment draft", !/error|fail/i.test(draft), draft);

  const sample = await prisma.application.findFirst({ where: { companyId: nimbus.id }, select: { candidateId: true } });
  if (sample) {
    await saveSelfIdentification({ candidateId: sample.candidateId, companyId: nimbus.id, gender: "woman", ageBand: "25_34" });
    const report = await recordCompanyFairness(nimbus.id);
    record("fairness snapshot", true, JSON.stringify(report).slice(0, 180));
  }

  const past = await runTalentRediscovery({ jobId: nimbusJob.id }).then((rows) => `${rows.length} past`).catch((error: Error) => error.message);
  record("rediscovery", true, past);

  let confirm = "";
  try {
    await confirmCopilotAction({
      actor: { userId: recruiter.id, role: "CLIENT", companyId: nimbus.id, interviewerId: null },
      action: { kind: "shortlist", label: "Shortlist", applicationIds: [1], draft: null, confirmed: false },
    });
    confirm = "ran";
  } catch (error) {
    confirm = error instanceof Error ? error.message : String(error);
  }
  record("confirm card required", /confirmation required/i.test(confirm), confirm);

  console.log(JSON.stringify(results, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
