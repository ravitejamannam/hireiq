import type { HiringTimelineEvent } from "@/lib/hiring/application-timeline";

function formatWhen(isoValue: string) {
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return isoValue;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ApplicationTimeline({
  events,
  showCandidate = false,
}: {
  events: HiringTimelineEvent[];
  showCandidate?: boolean;
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-zinc-500">No hiring events recorded yet.</p>
    );
  }

  return (
    <ol className="relative space-y-4 border-l border-zinc-200 pl-5">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full bg-stone-800" />
          <p className="text-sm font-semibold text-zinc-900">{event.title}</p>
          <p className="text-xs text-zinc-500">
            {formatWhen(event.at)}
            {showCandidate ? ` · ${event.candidateName}` : ""}
            {event.jobTitle ? ` · ${event.jobTitle}` : ""}
          </p>
          {event.detail ? (
            <p className="mt-1 text-sm text-zinc-600">{event.detail}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
