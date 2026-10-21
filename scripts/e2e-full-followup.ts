import { backendJobTitle, seededApplicantName } from "@/lib/testing/e2e-applicant-names";
import { assertE2eDatabase } from "@/lib/testing/e2e-database-guard";
import { judgeSharedEmailState, type ProbeStatus, type SharedEmailRow } from "@/lib/testing/e2e-probes";
import { randomUUID } from "node:crypto";

import { submitHostedApply } from "@/lib/apply/hosted-apply-service";
import { answerCopilot, confirmCopilotAction } from "@/lib/copilot/copilot-service";
import { saveSelfIdentification } from "@/lib/fairness/self-id";
import { recordCompanyFairness } from "@/lib/fairness/monitor";
import { createDraftAssessment } from "@/lib/assessments/generated-assessment-service";
import { prisma } from "@/lib/prisma";

const results: Array<{ name: string; status: ProbeStatus; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, status: ok ? "PASS" : "FAIL", ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

/** The probe could not be executed here. Never counted as a pass. */
function blocked(name: string, reason: string) {
  results.push({ name, status: "BLOCKED", ok: false, detail: reason });
  console.log(`BLOCKED ${name}: ${reason}`);
}

async function main() {
  assertE2eDatabase();
  const nimbus = await prisma.company.findFirstOrThrow({ where: { publicSlug: "e2e-nimbus" } });
  const kaveri = await prisma.company.findFirstOrThrow({ where: { publicSlug: "e2e-kaveri" } });
  const recruiter = await prisma.user.findFirstOrThrow({ where: { email: "recruiter1.nimbus@e2e.hireiq.local" } });
  const nimbusJob = await prisma.job.findFirstOrThrow({ where: { companyId: nimbus.id, title: backendJobTitle(nimbus.name) } });
  const kaveriJob = await prisma.job.findFirstOrThrow({ where: { companyId: kaveri.id, title: backendJobTitle(kaveri.name) } });
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
  for (const [slug, token] of [["nimbus", nimbusApply], ["kaveri", kaveriApply]] as const) {
    for (let index = 0; index < 50; index += 1) {
      await submitHostedApply({
        token,
        idempotencyKey: randomUUID(),
        body: {
          name: index === 0 ? "Shared Person" : seededApplicantName(slug, index),
          email: index === 0 ? "shared.person@example.com" : `${slug}-${index}@example.com`,
          phone: "9845012345",
          consent: true,
          location: "Bengaluru",
          experienceYears: index % 8,
          futureRolesConsent: index % 2 === 0,
          // Explicit answers only. An unanswered form is UNKNOWN, which the database stores as AI-not-permitted.
          // Even, non-multiple-of-5 applicants (e.g. 4) allow AI so the assessment flow has eligible people.
          ...(index % 5 === 0 ? { aiEvaluation: "human_only" } : index % 2 === 0 ? { aiEvaluation: "allowed" } : {}),
        },
      });
      created += 1;
    }
  }
  record("applications created", created === 100, String(created));

  // Hosted apply keeps one submission per (distribution, email), so the repeat submission at index 0 reuses the
  // resume-backed applicant that e2e-full-run created. The check is on stored ownership, not on a candidate name.
  const sharedEmail = "shared.person@example.com";
  const submissions = await prisma.hostedApplySubmission.findMany({
    where: { emailNormalized: sharedEmail },
    select: { id: true, distributionId: true, companyId: true },
  });
  const events = await prisma.applicationIngestionEvent.findMany({
    where: { hostedApplySubmissionId: { in: submissions.map((row) => row.id) } },
    select: { hostedApplySubmissionId: true, candidateId: true, applicationId: true },
  });
  const sharedRows: SharedEmailRow[] = [];
  for (const submission of submissions) {
    const event = events.find((row) => row.hostedApplySubmissionId === submission.id);
    const candidate = event?.candidateId ? await prisma.candidate.findUnique({ where: { id: event.candidateId }, select: { id: true, companyId: true } }) : null;
    const application = event?.applicationId ? await prisma.application.findUnique({ where: { id: event.applicationId }, select: { id: true, companyId: true, candidateId: true } }) : null;
    sharedRows.push({
      submissionId: submission.id,
      distributionId: submission.distributionId,
      companyId: submission.companyId,
      candidateId: candidate?.id ?? null,
      candidateCompanyId: candidate?.companyId ?? null,
      applicationId: application?.id ?? null,
      applicationCompanyId: application?.companyId ?? null,
      applicationCandidateId: application?.candidateId ?? null,
      applicationsOnCandidate: candidate ? await prisma.application.count({ where: { candidateId: candidate.id } }) : 0,
    });
  }
  const sharedVerdict = judgeSharedEmailState(sharedRows, [nimbus.id, kaveri.id]);
  record("shared email gives each company its own candidate and application", sharedVerdict.status === "PASS", sharedVerdict.detail);

  // Slot creation reads request headers (lib/auth/request-ip.ts), which do not exist in a script.
  // Calling it here only produced an exception, so no scheduling assertion is made. Not counted as a pass.
  blocked("scheduling slot creation", "needs an authenticated Next.js request context (headers() is unavailable in a script); cover it through the signed-in browser flow");
  blocked("scheduling refuses another company's job", "needs the same authenticated request context; no assertion was executed");

  const draft = await createDraftAssessment(nimbusJob.id, nimbusJob.companyId).then((value) => `items ${Array.isArray(value.items) ? value.items.length : 0}`).catch((error: Error) => error.message);
  record("assessment draft", !/error|fail/i.test(draft), draft);

  const sample = await prisma.application.findFirst({ where: { companyId: nimbus.id }, select: { candidateId: true } });
  if (sample) {
    await saveSelfIdentification({ candidateId: sample.candidateId, companyId: nimbus.id, gender: "woman", ageBand: "25_34" });
    const problems: string[] = [];
    const report = await recordCompanyFairness(nimbus.id);
    // Denominators and group membership, derived from the same rows the monitor just read: an application
    // contributes to a dimension group only when its candidate has a self-identification row, and never for
    // a missing or "prefer_not" value.
    const dimensions = ["gender", "ageBand", "disability", "region"] as const;
    const identities = await prisma.candidateSelfIdentification.findMany({ where: { companyId: nimbus.id } });
    const identityByCandidate = new Map(identities.map((row) => [row.candidateId, row]));
    const applications = await prisma.application.findMany({ where: { companyId: nimbus.id }, select: { id: true, jobId: true, candidateId: true } });
    const expectedGroups = new Map<string, number>();
    for (const application of applications) {
      const identity = identityByCandidate.get(application.candidateId);
      if (!identity) continue;
      for (const dimension of dimensions) {
        const group = (identity as unknown as Record<string, string | null>)[dimension];
        if (!group || group === "prefer_not") continue;
        const key = `${application.jobId}:${dimension}:${group}`;
        expectedGroups.set(key, (expectedGroups.get(key) ?? 0) + 1);
      }
    }
    const reportedGroups = new Map<string, number>();
    for (const section of report.sections) {
      const applied = section.stages.find((stage: { stage: string }) => stage.stage === "applied");
      for (const group of applied?.groups ?? []) reportedGroups.set(`${section.jobId}:${section.dimension}:${group.group}`, group.people);
    }
    for (const [key, count] of expectedGroups) {
      if (reportedGroups.get(key) !== count) problems.push(`denominator ${key}: expected ${count}, got ${reportedGroups.get(key) ?? "absent"}`);
    }
    for (const key of reportedGroups.keys()) {
      if (!expectedGroups.has(key)) problems.push(`unexpected group ${key}`);
    }
    // Rate arithmetic: rate is passed/people for every non-empty group and null for empty ones.
    for (const section of report.sections) {
      for (const stage of section.stages) {
        for (const group of stage.groups) {
          if (group.people === 0) {
            if (group.rate !== null) problems.push(`empty group has a rate: ${stage.stage}/${group.group}`);
          } else if (group.rate !== group.passed / group.people) {
            problems.push(`rate mismatch: ${stage.stage}/${section.dimension}/${group.group}`);
          }
        }
      }
      const expectedUndisclosed = identities.filter((row) => (row as unknown as Record<string, string | null>)[section.dimension] === "prefer_not").length;
      if (section.undisclosed !== expectedUndisclosed) problems.push(`undisclosed mismatch: ${section.dimension}`);
    }
    // Determinism: `fresh` legitimately changes once the first snapshot is persisted, so only sections compare.
    const second = await recordCompanyFairness(nimbus.id);
    if (JSON.stringify(second.sections) !== JSON.stringify(report.sections)) problems.push("two computations of the same data differ");
    record(
      "fairness snapshot",
      problems.length === 0,
      problems.slice(0, 3).join("; ") || `${report.sections.length} sections verified: denominators, group purity, rates, undisclosed counts, determinism`,
    );
  }

  // Rediscovery is asserted with real fixtures in e2e-remaining-flows.ts; no result is recorded here.

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
