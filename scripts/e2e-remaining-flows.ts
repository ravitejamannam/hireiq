import { readFileSync } from "node:fs";

import {
  overrideAssessmentGrade,
  publishAssessment,
  saveAssessmentProgress,
  sendAssessmentLink,
  submitGeneratedAssessment,
} from "@/lib/assessments/generated-assessment-service";
import { generateSecureToken } from "@/lib/auth/secure-token";
import { visibleScorecards } from "@/lib/interviews/slot-calculation";
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
  if (!process.env.DATABASE_URL?.includes("hireiq_e2e_full")) throw new Error("wrong database");
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
    select: { id: true, candidateId: true, futureRolesConsent: true, aiEvaluationOptOut: true, candidate: { select: { name: true } } },
  });
  const forced = rows.filter((row) => {
    const match = row.candidate.name.match(/Applicant (\d+)$/);
    return match ? Number(match[1]) % 2 === 1 : false;
  });
  await prisma.application.updateMany({
    where: { id: { in: forced.map((row) => row.id) } },
    data: { futureRolesConsent: false },
  });
  const after = await prisma.application.findMany({
    where: { jobId: source.id },
    select: { futureRolesConsent: true, aiEvaluationOptOut: true },
  });
  const consented = after.filter((row) => row.futureRolesConsent).length;
  const optedOut = after.filter((row) => row.aiEvaluationOptOut).length;
  const both = after.filter((row) => row.futureRolesConsent && row.aiEvaluationOptOut).length;
  const eligible = consented - both;
  const ranked = await runTalentRediscovery({ jobId: second.id });
  record(
    "rediscovery consent",
    ranked.length === eligible,
    `${rows.length} applicants, ${consented} consented, ${optedOut} opted out, ${both} both, rediscovery ${ranked.length}, expected ${eligible}`,
  );

  const scheduleApp = rows.find((row) => row.candidate.name === "nimbus Applicant 2");
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

  const assessApp = rows.find((row) => row.candidate.name === "nimbus Applicant 4" && !row.aiEvaluationOptOut);
  const admin = await prisma.user.findFirstOrThrow({ where: { email: "admin.nimbus@e2e.hireiq.local" } });
  if (!assessApp) {
    record("assessment", false, "missing applicant");
  } else {
    let draft = await prisma.generatedAssessment.findFirst({ where: { jobId: source.id }, orderBy: { id: "desc" } });
    if (!draft) record("assessment", false, "no draft");
    else {
      if (draft.status !== "PUBLISHED") draft = await publishAssessment(draft.id, admin.id);
      const link = await sendAssessmentLink({ applicationId: assessApp.id, actorUserId: admin.id });
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
        await overrideAssessmentGrade({ inviteId: invite.id, itemId: first.itemId, score: 5, reason: "Human review of the written answer.", actorUserId: admin.id });
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

  const portalApp = rows.find((row) => row.candidate.name === "nimbus Applicant 6");
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
    const opted = await setOptOut(portalApp.id, email, true);
    const exported = await exportPortalData(email);
    const withdrawn = await withdrawApplication(portalApp.id, email, "Taking another offer");
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
