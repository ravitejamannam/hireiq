import { seededApplicantIndex, seededApplicantName } from "@/lib/testing/e2e-applicant-names";
import { judgeRediscovery, pickAssessmentApplicant, type RediscoveryFixtureState } from "@/lib/testing/e2e-probes";
import { assertE2eDatabase } from "@/lib/testing/e2e-database-guard";
import { randomUUID } from "node:crypto";
import { submitHostedApply } from "@/lib/apply/hosted-apply-service";

import {
  overrideAssessmentGrade,
  publishAssessment,
  saveAssessmentProgress,
  sendAssessmentLink,
  submitGeneratedAssessment,
} from "@/lib/assessments/generated-assessment-service";
import { generateSecureToken } from "@/lib/auth/secure-token";
import { sendDueInterviewReminders } from "@/lib/interviews/interview-reminders";
import {
  bookSlotWithToken,
  cancelBookedInterview,
  rescheduleBookedSlot,
} from "@/lib/interviews/scheduling-service";
import {
  exportPortalData,
  savePortalDocument,
  setOptOut,
  withdrawApplication,
} from "@/lib/portal/portal-service";
import { prisma } from "@/lib/prisma";
import { runTalentRediscovery } from "@/lib/talent/rediscovery-service";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
}

async function main() {
  assertE2eDatabase();
  const company = await prisma.company.findFirstOrThrow({ where: { publicSlug: "e2e-nimbus" } });
  const source = await prisma.job.findFirstOrThrow({
    where: { companyId: company.id, title: "Nimbus Labs: Backend Engineer" },
    select: { id: true, assignedInterviewerId: true },
  });
  const second = await prisma.job.findFirstOrThrow({
    where: { companyId: company.id, title: "Nimbus Labs: Backend Engineer II" },
    select: { id: true },
  });

  const rows = await prisma.application.findMany({
    where: { jobId: source.id, companyId: company.id },
    select: { id: true, companyId: true, candidateId: true, futureRolesConsent: true, aiEvaluationOptOut: true, aiPreference: true, humanReviewRequestedAt: true, candidate: { select: { name: true } } },
  });
  if (!rows.some((row) => seededApplicantIndex(row.candidate.name, "nimbus") !== null)) {
    throw new Error('Setup: no "nimbus Applicant N" applicants on the source job. Run scripts/e2e-full-followup.ts before this script.');
  }
  const applyUrl = (await prisma.applyToken.findFirstOrThrow({
    where: { distribution: { jobId: source.id } },
    select: { distribution: { select: { applyUrlSnapshot: true } } },
  })).distribution.applyUrlSnapshot;
  const applyToken = applyUrl?.split("/apply/")[1] ?? "";

  // Dedicated synthetic fixtures. AI consent and future-roles consent are answered through the hosted form, so the
  // database trigger sets the AI flag itself; nothing here writes aiEvaluationOptOut or clears a flag.
  const fixtureDefs = [
    { key: "eligible", consent: true, ai: "allowed", resume: true, withdraw: false },
    { key: "no-resume", consent: true, ai: "allowed", resume: false, withdraw: false },
    { key: "opted-out", consent: true, ai: "human_only", resume: true, withdraw: false },
    { key: "withdrawn", consent: true, ai: "allowed", resume: true, withdraw: true },
    { key: "no-consent", consent: false, ai: "allowed", resume: true, withdraw: false },
  ] as const;
  const fixtureStates: RediscoveryFixtureState[] = [];
  for (const def of fixtureDefs) {
    const email = `rediscovery-${def.key}@example.com`;
    const name = `Rediscovery Fixture ${def.key}`;
    await submitHostedApply({
      token: applyToken,
      idempotencyKey: randomUUID(),
      body: { name, email, phone: "9845012345", consent: true, location: "Bengaluru", experienceYears: 6, futureRolesConsent: def.consent, aiEvaluation: def.ai },
    });
    const application = await prisma.application.findFirstOrThrow({
      where: { companyId: company.id, jobId: source.id, candidate: { name } },
      select: { id: true, candidateId: true },
    });
    if (def.resume) {
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
    }
    if (def.withdraw) await withdrawApplication(application.id, email, "Rediscovery fixture withdrew");
    const stored = await prisma.application.findUniqueOrThrow({
      where: { id: application.id },
      select: { futureRolesConsent: true, aiPreference: true, withdrawnAt: true },
    });
    const evidence = await prisma.candidateEvidence.count({
      where: { candidateId: application.candidateId, companyId: company.id, revokedAt: null, inlineText: { not: "" } },
    });
    const onTarget = await prisma.application.count({
      where: { candidateId: application.candidateId, jobId: second.id, withdrawnAt: null, status: { not: "REJECTED" } },
    });
    fixtureStates.push({
      key: def.key,
      candidateId: application.candidateId,
      hasResume: evidence > 0,
      futureRolesConsent: stored.futureRolesConsent,
      aiPreference: stored.aiPreference,
      withdrawn: stored.withdrawnAt !== null,
      activeOnTargetJob: onTarget > 0,
    });
  }
  const ranked = await runTalentRediscovery({ jobId: second.id });
  const verdict = judgeRediscovery(fixtureStates, ranked.map((row) => row.candidateId));
  record("rediscovery inclusion and exclusion", verdict.status === "PASS", verdict.detail);

  const scheduleApp = rows.find((row) => row.candidate.name === seededApplicantName("nimbus", 2));
  if (!scheduleApp || !source.assignedInterviewerId) {
    record("scheduling", false, "missing applicant or interviewer");
  } else {
    const startA = new Date(Date.now() + 30 * 60 * 60 * 1000);
    const startB = new Date(Date.now() + 54 * 60 * 60 * 1000);
    const slotA = await prisma.interviewSlot.create({
      data: { jobId: source.id, interviewerId: source.assignedInterviewerId, interviewType: "TECHNICAL", startAt: startA, durationMinutes: 45 },
    });
    const slotB = await prisma.interviewSlot.create({
      data: { jobId: source.id, interviewerId: source.assignedInterviewerId, interviewType: "TECHNICAL", startAt: startB, durationMinutes: 45 },
    });
    const token = generateSecureToken();
    await prisma.interviewBookingInvite.upsert({
      where: { applicationId: scheduleApp.id },
      update: { tokenHash: token.tokenHash, expiresAt: new Date(Date.now() + 7 * 86400000), usedAt: null },
      create: { applicationId: scheduleApp.id, tokenHash: token.tokenHash, expiresAt: new Date(Date.now() + 7 * 86400000) },
    });
    const booked = await bookSlotWithToken({ rawToken: token.rawToken, slotId: slotA.id });
    const moved = booked.ok ? await rescheduleBookedSlot({ applicationId: scheduleApp.id, fromSlotId: slotA.id, toSlotId: slotB.id }) : null;
    const reminderNow = new Date(startB.getTime() - 23 * 60 * 60 * 1000);
    const reminders = booked.ok ? await sendDueInterviewReminders(reminderNow) : { due: 0, sent: 0 };
    if (booked.ok) await cancelBookedInterview(scheduleApp.id);
    const cancelled = await prisma.interview.findFirst({ where: { applicationId: scheduleApp.id }, select: { result: true } });
    record(
      "scheduling book reschedule reminder cancel",
      booked.ok === true && moved != null && reminders.sent >= 1 && cancelled?.result === "CANCELLED",
      JSON.stringify({ booked, moved: moved?.toISOString() ?? null, reminders, cancelled: cancelled?.result ?? null }),
    );
  }

  const assessApp = pickAssessmentApplicant(rows, seededApplicantName("nimbus", 4));
  const admin = await prisma.user.findFirstOrThrow({ where: { email: "admin.nimbus@e2e.hireiq.local" } });
  if (!assessApp) {
    record("assessment", false, "no applicant who allowed AI evaluation (consent is not overridden)");
  } else {
    let draft = await prisma.generatedAssessment.findFirst({ where: { jobId: source.id }, orderBy: { id: "desc" } });
    if (!draft) record("assessment", false, "no draft");
    else {
      if (draft.status !== "PUBLISHED") draft = await publishAssessment(draft.id, admin.id, draft.companyId);
      const link = await sendAssessmentLink({ applicationId: assessApp.id, actorUserId: admin.id, companyId: assessApp.companyId, retake: true });
      const loaded = await import("@/lib/assessments/generated-assessment-service").then((mod) => mod.loadCandidateAssessment(link.rawToken));
      const patch: Record<string, string> = {};
      if (loaded && "items" in loaded && Array.isArray(loaded.items)) {
        for (const item of loaded.items as Array<{ id: string; type: string }>) {
          patch[item.id] = item.type === "multiple_choice" ? "0" : "I shipped Postgres indexes on a payment platform and explained the tradeoff.";
        }
      }
      await saveAssessmentProgress(link.rawToken, patch);
      const submitted = await submitGeneratedAssessment(link.rawToken, null);
      const invite = await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: link.inviteId } });
      const first = Array.isArray(invite.grades) ? (invite.grades as Array<{ itemId: string }>)[0] : null;
      if (first) {
        await overrideAssessmentGrade({ inviteId: invite.id, itemId: first.itemId, score: 1, reason: "Human review of the written answer.", actorUserId: admin.id, companyId: assessApp.companyId });
      }
      const updated = await prisma.generatedAssessmentInvite.findUniqueOrThrow({ where: { id: link.inviteId } });
      const grades = Array.isArray(updated.grades) ? updated.grades as Array<{ overrideReason?: string }> : [];
      record(
        "assessment take grade override",
        Boolean(invite.submittedAt) && grades.some((grade) => grade.overrideReason),
        JSON.stringify({ needsHuman: submitted.needsHuman, override: grades.find((grade) => grade.overrideReason)?.overrideReason ?? null }),
      );
    }
  }

  const portalApp = rows.find((row) => row.candidate.name === seededApplicantName("nimbus", 6));
  if (!portalApp) {
    record("portal", false, "missing applicant");
  } else {
    const email = "nimbus-6@example.com";
    const pdf = Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
    const uploaded = await savePortalDocument({
      email,
      applicationId: portalApp.id,
      kind: "RESUME",
      fileName: "portal-resume.pdf",
      contentType: "application/pdf",
      bytes: pdf,
    });
    await setOptOut(portalApp.id, email, true);
    const exported = await exportPortalData(email);
    await withdrawApplication(portalApp.id, email, "Taking another offer");
    const row = await prisma.application.findUnique({ where: { id: portalApp.id }, select: { aiEvaluationOptOut: true, withdrawnAt: true } });
    record(
      "portal upload opt-out export withdraw",
      !("error" in uploaded) && row?.aiEvaluationOptOut === true && exported.applications.length > 0 && row.withdrawnAt != null,
      JSON.stringify({ uploaded, optedOut: row?.aiEvaluationOptOut, exportCount: exported.applications.length, withdrawn: Boolean(row?.withdrawnAt) }),
    );
  }

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((row) => !row.ok).length;
  await prisma.$disconnect();
  if (failed) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
