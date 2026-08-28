import Link from "next/link";

import SlotPicker from "@/components/scheduling/SlotPicker";
import InterviewerPublicProfile from "@/components/interviewer/InterviewerPublicProfile";
import { listOpenSlotsForBooking } from "@/lib/interviews/scheduling-service";
import { loadSafeInterviewerProfileById } from "@/lib/interviewers/interviewer-profile-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
};

/**
 * Public candidate booking page (T100).
 * Token-scoped, expiring, single-use — same security posture as the
 * hosted-apply and assessment flows.
 */
export default async function SchedulePage({ params }: PageProps) {
  const { token } = await params;
  const booking = await listOpenSlotsForBooking(token);

  if (!booking || booking.slots.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-900">
            No times available
          </h1>
          <p className="mt-2 text-zinc-600">
            This booking link is invalid, expired, or all slots have been
            taken. The hiring team will reach out with new times.
          </p>
        </div>
      </main>
    );
  }

  const interviewerProfile = booking.interviewerId
    ? await loadSafeInterviewerProfileById(booking.interviewerId)
    : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <header>
        <p className="text-sm font-medium text-zinc-600">{booking.companyName}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
          Book your interview
        </h1>
        <p className="mt-2 text-zinc-600">
          Pick a time for your{" "}
          <span className="font-medium">{booking.jobTitle}</span> interview
          with {booking.interviewerName}.
        </p>
      </header>

      {interviewerProfile ? (
        <section className="mt-8">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">
            Meet your interviewer
          </h2>
          <InterviewerPublicProfile profile={interviewerProfile} />
        </section>
      ) : null}

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Choose a time</h2>
        <SlotPicker
          token={token}
          slots={booking.slots.map((slot) => ({
            id: slot.id,
            startAt: slot.startAt.toISOString(),
            durationMinutes: slot.durationMinutes,
          }))}
        />
      </section>

      <footer className="mt-6 text-center text-xs text-zinc-400">
        <Link href="/" className="hover:text-zinc-600">
          Powered by HireIQ
        </Link>
      </footer>
    </main>
  );
}
