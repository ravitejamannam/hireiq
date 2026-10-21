export type ChannelEvent = {
  id: number;
  receivedAt: Date;
  status: string;
  sourceChannel: string;
  externalApplicationId: string | null;
  distributionId: number | null;
};

export type ChannelApplication = {
  applicationId: number;
  candidateId: number;
  companyId: number;
  createdAt: Date;
  status: string;
  consentAt: Date | null;
  interviewCount: number;
  /** Application.source. Only LINKEDIN and NAUKRI are recorded board sources. */
  boardSource: string | null;
  events: ChannelEvent[];
};

export type ChannelRow = {
  intake: string;
  applications: number;
  candidates: number;
  consented: number;
  advanced: number;
  interviews: number;
  hires: number;
  recordedBoardSource: number;
};

export type ChannelReport = {
  from: Date | null;
  to: Date | null;
  rows: ChannelRow[];
  totals: {
    applications: number;
    candidates: number;
  };
  unavailable: {
    views: string;
    cost: string;
    campaign: string;
  };
};

const ADVANCED = new Set([
  "EXPERT_REVIEW",
  "TECH_EVALUATION",
  "SHORTLISTED",
  "SELECTED",
  "HIRED",
]);

/** Intake labels. These name how the application entered HireIQ, not the original job board. */
const RECORDED_INTAKE_LABELS: Record<string, string> = {
  HOSTED_APPLY: "Hosted Apply",
  LINKEDIN: "LinkedIn",
  INDEED: "Indeed",
  NAUKRI: "Naukri",
  REFERRAL: "Referral",
  MANUAL: "Manual Entry",
};

const IMPORT_REFERENCE = /^import:\d+:\d+$/;
const INBOUND_REFERENCE = /^inbound:\d+$/;

/**
 * One classifier for the channel table and the Sources list.
 * import:{batch}:{row} and inbound:{message} identify the intake mechanism.
 * They do not reveal which job board the candidate originally came from.
 */
export function classifyIntakeSource(event: {
  sourceChannel?: string | null;
  externalApplicationId?: string | null;
} | null | undefined): string {
  if (!event) return "Not Recorded";
  const reference = event.externalApplicationId ?? "";
  if (IMPORT_REFERENCE.test(reference)) return "CSV Import";
  if (INBOUND_REFERENCE.test(reference)) return "Inbound Email";
  const channel = event.sourceChannel?.trim();
  if (!channel) return "Not Recorded";
  return RECORDED_INTAKE_LABELS[channel] ?? "Not Recorded";
}

export function intakeMethod(event: ChannelEvent | undefined): string {
  return classifyIntakeSource(event);
}

/**
 * Earliest processed event. Later retries do not change the intake label.
 * Equal receivedAt values use the lower event id. Ids are unique and assigned
 * in insert order, so the tie picks the earlier row rather than array order.
 */
export function attributionEvent(events: ChannelEvent[]): ChannelEvent | undefined {
  const processed = events.filter((event) => event.status === "PROCESSED");
  const pool = processed.length > 0 ? processed : events;
  return [...pool].sort(compareAttributionEvents)[0];
}

function compareAttributionEvents(left: ChannelEvent, right: ChannelEvent): number {
  const time = left.receivedAt.getTime() - right.receivedAt.getTime();
  if (time !== 0) return time;
  return left.id - right.id;
}

export function channelDateRange(from: string | undefined, to: string | undefined): {
  from: Date | null;
  to: Date | null;
  error: string | null;
} {
  const start = parseDay(from);
  const end = parseDay(to);
  if (from && !start) return { from: null, to: null, error: "The start date is not a calendar day." };
  if (to && !end) return { from: null, to: null, error: "The end date is not a calendar day." };
  if (start && end && start.getTime() > end.getTime()) {
    return { from: start, to: end, error: "The start date is after the end date." };
  }
  return { from: start, to: end, error: null };
}

function parseDay(value: string | undefined): Date | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildChannelReport(input: {
  companyId: number;
  applications: ChannelApplication[];
  from?: Date | null;
  to?: Date | null;
}): ChannelReport {
  const from = input.from ?? null;
  const to = input.to ?? null;
  const end = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : null;
  const inRange = input.applications.filter((application) => {
    if (application.companyId !== input.companyId) return false;
    if (from && application.createdAt < from) return false;
    if (end && application.createdAt >= end) return false;
    return true;
  });
  const groups = new Map<string, ChannelApplication[]>();
  for (const application of inRange) {
    const intake = intakeMethod(attributionEvent(application.events));
    const list = groups.get(intake) ?? [];
    list.push(application);
    groups.set(intake, list);
  }
  const rows = [...groups.entries()]
    .map(([intake, applications]) => ({
      intake,
      applications: applications.length,
      candidates: new Set(applications.map((application) => application.candidateId)).size,
      consented: applications.filter((application) => application.consentAt != null).length,
      advanced: applications.filter((application) => ADVANCED.has(application.status)).length,
      interviews: applications.filter((application) => application.interviewCount > 0).length,
      hires: applications.filter((application) => application.status === "HIRED").length,
      recordedBoardSource: applications.filter(
        (application) => application.boardSource === "LINKEDIN" || application.boardSource === "NAUKRI",
      ).length,
    }))
    .sort((left, right) => right.applications - left.applications || left.intake.localeCompare(right.intake));

  return {
    from,
    to,
    rows,
    totals: {
      applications: inRange.length,
      candidates: new Set(inRange.map((application) => application.candidateId)).size,
    },
    unavailable: {
      views: "Job views are not recorded.",
      cost: "Channel cost is not recorded, so cost per application and cost per hire are not calculated.",
      campaign: "Campaign and UTM values are not stored on applications.",
    },
  };
}
