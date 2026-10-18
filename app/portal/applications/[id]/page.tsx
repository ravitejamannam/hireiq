import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { SelfIdForm } from "@/components/fairness/SelfIdForm";
import { PortalApplicationView, stageLabel } from "@/components/portal/PortalViews";
import { nextPortalAction } from "@/lib/portal/candidate-portal";
import { loadPortalApplication } from "@/lib/portal/portal-service";
import { PORTAL_COOKIE, readPortalSession } from "@/lib/portal/portal-session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PortalApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; selfid?: string }>;
}) {
  const session = readPortalSession((await cookies()).get(PORTAL_COOKIE)?.value);
  if (!session) redirect("/portal");
  const { id } = await params;
  const applicationId = Number(id);
  const application = await loadPortalApplication(session.email, applicationId);
  if (!application) notFound();
  const query = await searchParams;
  const invites = await prisma.generatedAssessmentInvite.findMany({
    where: { applicationId: application.id },
    include: { assessment: { select: { timeLimitMinutes: true } } },
    orderBy: { id: "desc" },
  });
  const deletion = await prisma.candidateDeletionRequest.findFirst({
    where: { applicationId: application.id, status: "QUEUED" },
    select: { id: true },
  });
  const now = new Date();
  const upcoming = application.interviews.some((interview) => interview.interviewAt > now && interview.result === "PENDING");
  const timeline = [
    { at: application.createdAt.toISOString(), label: "Applied" },
    ...application.outcomeEvents
      .filter((event) => event.toStatus)
      .map((event) => ({ at: event.occurredAt.toISOString(), label: stageLabel(event.toStatus ?? "", false) })),
    ...(application.withdrawnAt ? [{ at: application.withdrawnAt.toISOString(), label: "Withdrawn" }] : []),
  ];
  return (
    <>
    <PortalApplicationView
      id={application.id}
      job={application.job.title}
      company={application.job.company.name}
      stage={stageLabel(application.status, Boolean(application.withdrawnAt))}
      notice={
        application.job.company.applyNoticeText ??
        "HireIQ may draft notes for recruiters. A person approves anything you would see. Opting out stops AI evaluation of this application."
      }
      optedOut={application.aiEvaluationOptOut}
      humanReview={application.humanReviewRequestedAt !== null}
      withdrawn={Boolean(application.withdrawnAt)}
      unsubscribed={application.emailUnsubscribedAt !== null}
      deletionQueued={Boolean(deletion)}
      futureRoles={application.futureRolesConsent}
      timeline={timeline}
      nextAction={nextPortalAction({
        withdrawn: Boolean(application.withdrawnAt),
        hasResume: application.portalDocuments.some((doc) => doc.kind === "RESUME"),
        pendingAssessment: invites.some((invite) => !invite.submittedAt),
        needsInterview: application.status === "TECH_EVALUATION" && !upcoming,
      })}
      interviews={application.interviews.map((interview) => ({
        id: interview.id,
        at: interview.interviewAt.toISOString(),
        type: interview.type,
        meetUrl: interview.meetUrl,
        past: interview.interviewAt <= now || interview.result !== "PENDING",
      }))}
      assessments={invites.map((invite) => ({
        deadline: invite.expiresAt.toISOString(),
        limit: invite.extraTimeRequested ? `${Math.round(invite.assessment.timeLimitMinutes * 1.5)} minutes` : `${invite.assessment.timeLimitMinutes} minutes`,
        submittedAt: invite.submittedAt ? invite.submittedAt.toISOString() : null,
      }))}
      documents={application.portalDocuments.map((doc) => ({
        fileName: doc.fileName,
        kind: doc.kind,
        message: doc.parseMessage ?? "",
      }))}
      error={query.error ? decodeURIComponent(query.error) : null}
    />
    <SelfIdForm action="/portal/self-id" saved={query.selfid === "1"} />
    </>
  );
}
