import { attributionEvent, classifyIntakeSource, type ChannelEvent } from "@/lib/analytics/channel-analytics";

/**
 * Public application row for GET /api/v1/applications.
 *
 * `source` stays the sourceChannel of the highest event id, or null when the
 * application has no ingestion event. Existing clients can keep reading it.
 *
 * `intakeMethod` is the canonical intake label from attributionEvent and
 * classifyIntakeSource. No ingestion event, a blank channel, or an unknown
 * channel is "Not Recorded". CSV import and inbound email name how the
 * application entered HireIQ. They are not an original job-board channel.
 * Application.source is not consulted.
 */
export type PublicIngestionEvent = {
  id: number;
  receivedAt: Date;
  status: string;
  sourceChannel: string;
  externalApplicationId: string | null;
};

export type PublicApplication = {
  id: number;
  jobId: number;
  name: string;
  status: string;
  source: string | null;
  intakeMethod: string;
  appliedAt: string;
};

export function toPublicApplication(input: {
  id: number;
  jobId: number;
  name: string;
  status: string;
  createdAt: Date;
  ingestionEvents: PublicIngestionEvent[];
}): PublicApplication {
  const events: ChannelEvent[] = input.ingestionEvents.map((event) => ({
    ...event,
    distributionId: null,
  }));
  const latest = events.reduce<ChannelEvent | null>(
    (best, event) => (!best || event.id > best.id ? event : best),
    null,
  );
  return {
    id: input.id,
    jobId: input.jobId,
    name: input.name,
    status: input.status,
    source: latest?.sourceChannel ?? null,
    intakeMethod: classifyIntakeSource(attributionEvent(events)),
    appliedAt: input.createdAt.toISOString(),
  };
}
