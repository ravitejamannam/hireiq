import type { Metadata } from "next";

import { getInterviewerSchedule } from "@/lib/repositories/interviewer-portal-repository";

export const metadata: Metadata = {
  title: "My interviews",
};

const TYPE_LABEL: Record<string, string> = {
  PHONE_SCREEN: "Phone screen",
  TECHNICAL: "Technical",
  SYSTEM_DESIGN: "System design",
  HR: "HR",
};

const RESULT_LABEL: Record<string, string> = {
  PENDING: "Scheduled",
  PASSED: "Passed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

function formatAt(value: Date) {
  return value.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function InterviewerInterviewsPage() {
  const { upcoming, past } = await getInterviewerSchedule();

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Interviewer portal</p>
      <h1 className="mt-2 text-3xl font-bold text-black">My interviews</h1>
      <p className="mt-2 text-zinc-600">Your scheduled interviews for the jobs you are assigned to.</p>

      <section className="mt-6">
        <h2 className="font-semibold text-black">Upcoming</h2>
        {upcoming.length > 0 ? (
          <ul className="mt-3 space-y-3">
            {upcoming.map((interview) => (
              <li key={interview.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-black">{formatAt(interview.interviewAt)}</p>
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs">{TYPE_LABEL[interview.type] ?? interview.type}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-700">
                  {interview.application.candidate.name} · {interview.application.job.title}
                </p>
                {interview.meetUrl ? (
                  <a className="mt-1 inline-block text-sm font-medium underline underline-offset-2" href={interview.meetUrl} target="_blank" rel="noopener noreferrer">
                    Open meeting link
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">Nothing scheduled. Booked interviews appear here with their meeting links.</p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-semibold text-black">Recent past</h2>
        {past.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {past.map((interview) => (
              <li key={interview.id} className="rounded-xl border border-zinc-200 bg-white p-4 text-sm">
                <span className="font-medium text-black">{formatAt(interview.interviewAt)}</span>
                <span className="ml-2 text-zinc-700">{interview.application.candidate.name} · {interview.application.job.title}</span>
                <span className="ml-2 rounded bg-zinc-100 px-2 py-0.5 text-xs">{RESULT_LABEL[interview.result] ?? interview.result}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">No past interviews yet.</p>
        )}
      </section>
    </div>
  );
}
