export type BusyWindow = { startMs: number; endMs: number };

export type InterviewerCalendar = {
  id: number;
  windows: BusyWindow[];
  assignedCount: number;
};

export type OpenSlot = { startMs: number; endMs: number };

function overlaps(left: BusyWindow, right: BusyWindow) {
  return left.startMs < right.endMs && right.startMs < left.endMs;
}

export function freeFor(person: InterviewerCalendar, slot: OpenSlot) {
  return !person.windows.some((window) => overlaps(window, slot));
}

/** First slot every listed interviewer can attend. */
export function findPanelSlot(people: InterviewerCalendar[], slots: OpenSlot[]): OpenSlot | null {
  if (people.length === 0) return null;
  const ordered = [...slots].sort((left, right) => left.startMs - right.startMs);
  return ordered.find((slot) => people.every((person) => freeFor(person, slot))) ?? null;
}

/** Give the next interview to the interviewer with the lightest assigned load who is free. */
export function assignBalanced(people: InterviewerCalendar[], slot: OpenSlot): number | null {
  const free = people.filter((person) => freeFor(person, slot));
  free.sort((left, right) => left.assignedCount - right.assignedCount || left.id - right.id);
  return free[0]?.id ?? null;
}

export function roundRobin(ids: number[], cursor: number) {
  if (ids.length === 0) return { id: null as number | null, next: 0 };
  const index = ((cursor % ids.length) + ids.length) % ids.length;
  return { id: ids[index], next: (index + 1) % ids.length };
}

/** Pack a loop of rounds into consecutive slots with a gap between them. */
export function backToBack(input: {
  slots: OpenSlot[];
  rounds: number;
  gapMinutes: number;
}): OpenSlot[] | null {
  if (input.rounds < 1) return null;
  const ordered = [...input.slots].sort((left, right) => left.startMs - right.startMs);
  const gapMs = input.gapMinutes * 60 * 1000;
  for (let start = 0; start <= ordered.length - input.rounds; start += 1) {
    const picked = [ordered[start]];
    for (let index = start + 1; index < ordered.length && picked.length < input.rounds; index += 1) {
      const previous = picked[picked.length - 1];
      const candidate = ordered[index];
      if (candidate.startMs >= previous.endMs + gapMs) picked.push(candidate);
    }
    if (picked.length === input.rounds) return picked;
  }
  return null;
}

export function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "shortOffset",
  }).formatToParts(instant);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
    offset: read("timeZoneName"),
  };
}
