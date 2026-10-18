const KOLKATA_OFFSET_MINUTES = 5 * 60 + 30;

export type BusyInterval = { start: Date; end: Date };

export type SlotPlan = {
  now: Date;
  timeZoneOffsetMinutes?: number;
  workingStartHour?: number;
  workingEndHour?: number;
  durationMinutes: number;
  bufferMinutes?: number;
  leadHours?: number;
  horizonDays?: number;
  busy?: BusyInterval[];
};

function overlaps(start: Date, end: Date, busy: BusyInterval[]) {
  return busy.some((interval) => start < interval.end && end > interval.start);
}

/** Local wall-clock parts for a fixed offset (default Asia/Kolkata). */
function localParts(date: Date, offsetMinutes: number) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

function utcFromLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  offsetMinutes: number,
) {
  return new Date(Date.UTC(year, month, day, hour, minute) - offsetMinutes * 60_000);
}

export function calculateOpenSlots(plan: SlotPlan): Date[] {
  const offset = plan.timeZoneOffsetMinutes ?? KOLKATA_OFFSET_MINUTES;
  const startHour = plan.workingStartHour ?? 10;
  const endHour = plan.workingEndHour ?? 18;
  const buffer = plan.bufferMinutes ?? 15;
  const leadMs = (plan.leadHours ?? 24) * 60 * 60 * 1000;
  const horizon = plan.horizonDays ?? 10;
  const earliest = new Date(plan.now.getTime() + leadMs);
  const busy = plan.busy ?? [];
  const slots: Date[] = [];
  const step = plan.durationMinutes + buffer;

  const origin = localParts(earliest, offset);
  for (let day = 0; day < horizon; day += 1) {
    const cursor = new Date(Date.UTC(origin.year, origin.month, origin.day + day));
    for (let minute = startHour * 60; minute + plan.durationMinutes <= endHour * 60; minute += step) {
      const start = utcFromLocal(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate(),
        Math.floor(minute / 60),
        minute % 60,
        offset,
      );
      const end = new Date(start.getTime() + plan.durationMinutes * 60_000);
      if (start < earliest) continue;
      if (overlaps(start, end, busy)) continue;
      slots.push(start);
    }
  }
  return slots;
}

export function reminderInstants(start: Date) {
  return [
    new Date(start.getTime() - 24 * 60 * 60 * 1000),
    new Date(start.getTime() - 60 * 60 * 1000),
  ];
}

export function visibleScorecards<T extends { interviewerId: number; submittedAt: Date | null }>(input: {
  viewerInterviewerId: number | null;
  cards: T[];
}) {
  if (input.viewerInterviewerId === null) {
    return input.cards.filter((card) => card.submittedAt);
  }
  const mine = input.cards.find((card) => card.interviewerId === input.viewerInterviewerId);
  if (!mine?.submittedAt) {
    return input.cards.filter((card) => card.interviewerId === input.viewerInterviewerId);
  }
  return input.cards.filter((card) => card.submittedAt);
}
