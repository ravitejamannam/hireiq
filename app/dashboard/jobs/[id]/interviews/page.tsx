import { notFound } from "next/navigation";

import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import NoShowButton from "@/components/interviews/NoShowButton";
import { deniesCrossCompany, requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";
import { visibleScorecards } from "@/lib/interviews/slot-calculation";

type PageProps = { params: Promise<{ id: string }> };

export default async function JobInterviewsPage({ params }: PageProps) {
  const jobId = Number((await params).id);
  if (!Number.isInteger(jobId)) notFound();
  const admin = await requireAdmin();
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      title: true,
      companyId: true,
      applications: {
        select: {
          interviews: {
            orderBy: { interviewAt: "desc" },
            take: 5,
            select: { id: true, applicationId: true, interviewAt: true, type: true, noShow: true, result: true },
          },
        },
      },
      interviewSlots: {
        orderBy: { startAt: "asc" },
        take: 30,
        select: {
          id: true,
          startAt: true,
          durationMinutes: true,
          status: true,
          interviewType: true,
          interviewer: { select: { name: true } },
        },
      },
    },
  });
  if (!job || deniesCrossCompany(admin, job.companyId)) notFound();
  const cards = visibleScorecards({
    viewerInterviewerId: 0,
    cards: [] as Array<{ interviewerId: number; submittedAt: Date | null }>,
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">{job.title}</h1>
      <p className="mt-1 text-sm text-zinc-500">Interview plan · Asia/Kolkata · scorecards hidden until submitted ({cards.length})</p>
      <ul className="mt-6 space-y-2">
        {job.applications.flatMap((application) => application.interviews).map((interview) => (
          <li key={interview.id} className="flex items-center justify-between rounded-xl border border-zinc-200 px-4 py-3">
            <span className="text-sm">{interview.type} · {interview.result}{interview.noShow ? " · No-show" : ""}</span>
            <NoShowButton interviewId={interview.id} applicationId={interview.applicationId} noShow={interview.noShow} />
          </li>
        ))}
      </ul>
      <ul className="mt-6 space-y-2">
        {job.interviewSlots.map((slot) => (
          <li key={slot.id} className="rounded-xl border border-zinc-200 px-4 py-3">
            <p className="font-semibold">{slot.interviewType} · {slot.status}</p>
            <p className="text-sm text-zinc-600">
              {slot.startAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {slot.durationMinutes} min · {slot.interviewer.name}
            </p>
          </li>
        ))}
        {job.interviewSlots.length === 0 ? <li className="text-sm text-zinc-500">No slots published yet.</li> : null}
      </ul>
      <CopilotPanel jobId={jobId} companyId={job.companyId} />
    </main>
  );
}
