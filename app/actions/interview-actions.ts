"use server";

import { revalidatePath } from "next/cache";
import type { InterviewResult, InterviewType } from "@prisma/client";

import { requireAdmin } from "@/lib/auth/authorization";
import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { sendOutboundEmail } from "@/lib/communication/email-transport";
import { mintBookingInviteForApplication } from "@/lib/interviews/scheduling-service";
import {
  assertInterviewerOwnsApplication,
  assertInterviewerOwnsInterview,
} from "@/lib/auth/interviewer-assignment";
import { prisma } from "@/lib/prisma";
import { validateApplicationId } from "@/lib/validation/application-validation";
import {
  validateInterviewId,
  validateInterviewInput,
} from "@/lib/validation/interview-validation";

export async function createInterview(
  applicationId: number,
  type: InterviewType,
  interviewAt: Date,
  result: InterviewResult,
) {
  const validatedApplicationId = validateApplicationId(applicationId);
  const { application } = await assertInterviewerOwnsApplication(
    validatedApplicationId,
  );
  const fields = validateInterviewInput(type, interviewAt, result);

  const interview = await prisma.interview.create({
    data: {
      applicationId: application.id,
      type: fields.type,
      interviewAt: fields.interviewAt,
      result: fields.result,
    },
  });

  revalidateInterviewerEvidencePaths(application.jobId, application.id);

  return interview;
}

export async function updateInterview(
  id: number,
  applicationId: number,
  type: InterviewType,
  interviewAt: Date,
  result: InterviewResult,
) {
  const interviewId = validateInterviewId(id);
  validateApplicationId(applicationId);
  const { interview } = await assertInterviewerOwnsInterview(interviewId);
  const fields = validateInterviewInput(type, interviewAt, result);

  const updated = await prisma.interview.update({
    where: {
      id: interview.id,
    },
    data: {
      type: fields.type,
      interviewAt: fields.interviewAt,
      result: fields.result,
    },
  });

  revalidateInterviewerEvidencePaths(
    interview.application.jobId,
    interview.applicationId,
  );

  return updated;
}

export async function deleteInterview(id: number) {
  const interviewId = validateInterviewId(id);
  const { interview } = await assertInterviewerOwnsInterview(interviewId);

  await prisma.interview.delete({
    where: {
      id: interview.id,
    },
  });

  revalidateInterviewerEvidencePaths(
    interview.application.jobId,
    interview.applicationId,
  );
}

export async function markInterviewNoShow(interviewId: number, noShow: boolean) {
  const admin = await requireAdmin();
  const id = validateInterviewId(interviewId);
  const interview = await prisma.interview.update({
    where: { id },
    data: { noShow },
    select: { id: true, application: { select: { id: true, companyId: true } } },
  });
  await writeAuditLog(prisma, {
    actorUserId: admin.id,
    actorRole: "ADMIN",
    companyId: interview.application.companyId,
    action: noShow ? "INTERVIEW_NO_SHOW" : "INTERVIEW_NO_SHOW_CLEARED",
    targetType: "INTERVIEW",
    targetId: interview.id,
    reason: noShow ? "Candidate did not attend." : "No-show cleared.",
  });
  revalidatePath("/dashboard/jobs");
  return { applicationId: interview.application.id };
}

export async function sendInterviewRescheduleLink(applicationId: number) {
  const invite = await mintBookingInviteForApplication({
    actorIsAdminVerified: true,
    applicationId,
  });
  const contact = await prisma.applicationIngestionEvent.findFirst({
    where: { applicationId },
    orderBy: { id: "desc" },
    select: { applicantEmailNormalized: true, applicantName: true, job: { select: { title: true } } },
  });
  const owner = await prisma.application.findUnique({ where: { id: applicationId }, select: { candidateId: true, companyId: true } });
  if (invite.bookingUrl && contact?.applicantEmailNormalized) {
    await sendOutboundEmail({
      scope: owner ? { companyId: owner.companyId, candidateId: owner.candidateId } : undefined,
      to: contact.applicantEmailNormalized,
      subject: `Reschedule your interview: ${contact.job.title}`,
      text: `Hi ${contact.applicantName ?? "there"}, pick a new time: ${invite.bookingUrl}`,
      html: `<p>Hi ${contact.applicantName ?? "there"},</p><p><a href="${invite.bookingUrl}">Pick a new time</a>.</p>`,
    });
  }
  return { bookingUrl: invite.bookingUrl };
}

function revalidateInterviewerEvidencePaths(
  jobId: number,
  applicationId: number,
) {
  try {
    revalidatePath("/interviewer");
    revalidatePath("/interviewer/requirements");
    revalidatePath(`/interviewer/requirements/${jobId}`);
    revalidatePath(
      `/interviewer/requirements/${jobId}/candidates/${applicationId}`,
    );
    revalidatePath(`/client/requirements/${jobId}`);
    revalidatePath(
      `/client/requirements/${jobId}/candidates/${applicationId}`,
    );
    revalidatePath(`/dashboard/requirements/${jobId}`);
    revalidatePath("/dashboard/technical-evaluations");
  } catch {
    // revalidatePath requires a Next.js request context
  }
}
