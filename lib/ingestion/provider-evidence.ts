import {
  CandidateEvidenceOrigin,
  CandidateEvidenceSourceType,
  type Prisma,
} from "@prisma/client";

import { createHash } from "node:crypto";

import { createEvidence } from "@/lib/repositories/candidate-evidence-repository";

/**
 * Provider-ingestion evidence capture (T96 Phase 2 / T91 extension).
 *
 * Every provider-sourced application must land with an INGESTION_EVENT
 * evidence artifact so the traceability chain holds for ALL channels:
 *
 *   Application → IngestionEvent → CandidateEvidence → raw delivery
 *
 * The inline text is a deterministic, labeled rendering of exactly the
 * fields the provider supplied — nothing invented, nothing enriched
 * (constitution §1: never fabricate candidate facts). Deterministic first:
 * no AI anywhere in this path (§7).
 */

import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export type ProviderApplicantSuppliedFields = {
  applicantName: string;
  applicantEmailNormalized: string | null;
  applicantLocation: string | null;
  applicantExperienceYears: number | null;
  externalCandidateId: string | null;
  externalApplicationId: string | null;
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Deterministic textual artifact of provider-supplied applicant data. */
export function buildProviderApplicantEvidenceText(
  fields: ProviderApplicantSuppliedFields,
): string {
  const lines = [
    `name: ${fields.applicantName}`,
    fields.applicantEmailNormalized
      ? `email: ${fields.applicantEmailNormalized}`
      : null,
    fields.applicantLocation ? `location: ${fields.applicantLocation}` : null,
    fields.applicantExperienceYears !== null
      ? `experience_years: ${fields.applicantExperienceYears}`
      : null,
    fields.externalCandidateId
      ? `external_candidate_id: ${fields.externalCandidateId}`
      : null,
    fields.externalApplicationId
      ? `external_application_id: ${fields.externalApplicationId}`
      : null,
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}

/**
 * Create the INGESTION_EVENT evidence row inside the caller's transaction.
 * Idempotent by construction: callers only invoke this while holding the
 * ingestion-event row lock and only before PROCESSED is committed, so a
 * given event can produce at most one evidence row.
 */
export async function captureProviderIngestionEvidence(
  tx: Db,
  input: {
    companyId: number;
    candidateId: number;
    applicationId: number;
    ingestionEventId: number;
    occurredAt: Date;
    fields: ProviderApplicantSuppliedFields;
  },
): Promise<void> {
  const inlineText = buildProviderApplicantEvidenceText(input.fields);

  await createEvidence(
    {
      companyId: input.companyId,
      candidateId: input.candidateId,
      applicationId: input.applicationId,
      sourceType: CandidateEvidenceSourceType.INGESTION_EVENT,
      origin: CandidateEvidenceOrigin.PROVIDER_PROVIDED,
      ingestionEventId: input.ingestionEventId,
      hostedApplySubmissionId: null,
      actorUserId: null,
      inlineText,
      contentSha256: sha256Hex(inlineText),
      createdAt: input.occurredAt,
    },
    tx,
  );
}
