import type {
  ApplicationIngestionChannel,
  SourcingDatabaseSource,
} from "@prisma/client";

/**
 * Public/hiring-desk source labels. Prefer ApplicationIngestionEvent.sourceChannel
 * over Application.source (T85: those are not the same field).
 */

export const INGESTION_CHANNEL_LABELS: Record<ApplicationIngestionChannel, string> = {
  HOSTED_APPLY: "Hosted apply",
  LINKEDIN: "LinkedIn",
  INDEED: "Indeed",
  NAUKRI: "Naukri",
  REFERRAL: "Referral",
  MANUAL: "Manual",
};

const SOURCING_DATABASE_LABELS: Record<SourcingDatabaseSource, string> = {
  LINKEDIN: "LinkedIn",
  NAUKRI: "Naukri",
};

export function ingestionChannelLabel(
  channel: ApplicationIngestionChannel | string | null | undefined,
): string {
  if (!channel) return "Unknown";
  return (
    INGESTION_CHANNEL_LABELS[channel as ApplicationIngestionChannel] ??
    String(channel)
  );
}

export function sourcingDatabaseLabel(
  source: SourcingDatabaseSource | string | null | undefined,
): string {
  if (!source) return "Unknown";
  return (
    SOURCING_DATABASE_LABELS[source as SourcingDatabaseSource] ?? String(source)
  );
}

/**
 * Resolve the channel a hiring desk should show for an application.
 * Latest processed ingestion event wins; otherwise hosted apply is inferred
 * from a hosted submission id; otherwise the LinkedIn/Naukri sourcing field.
 */
export function resolveApplicationSourceLabel(input: {
  sourceChannel?: ApplicationIngestionChannel | string | null;
  sourcingDatabaseSource?: SourcingDatabaseSource | string | null;
  hostedApplySubmissionId?: number | null;
}): string {
  if (input.sourceChannel) {
    return ingestionChannelLabel(input.sourceChannel);
  }
  if (input.hostedApplySubmissionId) {
    return INGESTION_CHANNEL_LABELS.HOSTED_APPLY;
  }
  if (input.sourcingDatabaseSource) {
    return sourcingDatabaseLabel(input.sourcingDatabaseSource);
  }
  return "Unknown";
}
