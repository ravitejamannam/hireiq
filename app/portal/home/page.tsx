import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PortalHomeView, stageLabel } from "@/components/portal/PortalViews";
import { nextPortalAction } from "@/lib/portal/candidate-portal";
import { applicationsForEmail } from "@/lib/portal/portal-service";
import { PORTAL_COOKIE, readPortalSession } from "@/lib/portal/portal-session";

export const dynamic = "force-dynamic";

export default async function PortalHomePage() {
  const session = readPortalSession((await cookies()).get(PORTAL_COOKIE)?.value);
  if (!session) redirect("/portal");
  const rows = await applicationsForEmail(session.email);
  const pending = await import("@/lib/prisma").then(({ prisma }) =>
    prisma.generatedAssessmentInvite.findMany({
      where: { applicationId: { in: rows.map((row) => row.id) }, submittedAt: null },
      select: { applicationId: true },
    }),
  );
  const pendingIds = new Set(pending.map((row) => row.applicationId));
  return (
    <PortalHomeView
      email={session.email}
      cards={rows.map((row) => {
        const upcoming = row.interviews.some((interview) => interview.interviewAt > new Date() && interview.result === "PENDING");
        const next = nextPortalAction({
          withdrawn: Boolean(row.withdrawnAt),
          hasResume: row.portalDocuments.some((doc) => doc.kind === "RESUME"),
          pendingAssessment: pendingIds.has(row.id),
          needsInterview: row.status === "TECH_EVALUATION" && !upcoming && !row.withdrawnAt,
        });
        return {
          id: row.id,
          job: row.job.title,
          company: row.job.company.name,
          stage: stageLabel(row.status, Boolean(row.withdrawnAt)),
          nextAction: next,
          href: `/portal/applications/${row.id}`,
        };
      })}
    />
  );
}
