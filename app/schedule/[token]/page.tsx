import { notFound } from "next/navigation";

import { LocalDateTime, RememberTimeZone } from "@/components/portal/LocalDateTime";
import { bookSlotWithToken, listOpenSlotsForBooking } from "@/lib/interviews/scheduling-service";

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ slot?: string; booked?: string }>;
};

export default async function SchedulePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;
  if (query.slot) {
    await bookSlotWithToken({ rawToken: token, slotId: Number(query.slot) });
  }
  const page = await listOpenSlotsForBooking(token);
  if (!page) notFound();

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-bold">{page.jobTitle}</h1>
      <RememberTimeZone endpoint={`/schedule/${token}/timezone`} />
      <p className="mt-2 text-sm text-zinc-800">
        Pick a time with {page.interviewerName}. Times are shown in your time zone and are at least 24 hours out.
      </p>
      <ul className="mt-6 space-y-2">
        {page.slots.map((slot) => (
          <li key={slot.id}>
            <a
              className="block rounded-xl border border-zinc-200 px-4 py-3 hover:bg-zinc-50"
              href={`/schedule/${token}?slot=${slot.id}`}
            >
              <LocalDateTime iso={slot.startAt.toISOString()} /> · {slot.durationMinutes} min
            </a>
          </li>
        ))}
        {page.slots.length === 0 ? <li className="text-sm text-zinc-500">No open slots.</li> : null}
      </ul>
    </main>
  );
}
