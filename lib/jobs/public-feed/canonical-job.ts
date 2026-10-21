import { Prisma } from "@prisma/client";

import {
  inferEmploymentType,
  parseJobPostingNarrative,
  type EmploymentType,
} from "@/lib/jobs/job-posting-view";

/**
 * Canonical public job projection (T96 Phase 1).
 *
 * Pure, deterministic mapping from a PUBLISHED distribution + its pinned
 * JobSpecificationVersion to the shape consumed by outbound channels
 * (XML feed, JSON-LD). No AI, no side effects (constitution §7).
 *
 * Versioning: bump CANONICAL_FEED_VERSION whenever field semantics change;
 * consumers may pin to a version for reproducible rendering (§43).
 */

export const CANONICAL_FEED_VERSION = 3;

export type CanonicalJobPosting = {
  externalRef: string; // stable public reference: distribution id
  distributionId: number;
  title: string;
  companyName: string;
  companyPublicSlug: string;
  location: string | null;
  employmentType: EmploymentType | null;
  description: string;
  applyUrl: string;
  datePosted: Date;
  validThrough: Date | null;
  remotePolicy: string | null;
  compensationRange: string | null;
};

type DistributionWithSpec = Prisma.JobDistributionGetPayload<{
  select: {
    id: true;
    createdAt: true;
    applyUrlSnapshot: true;
    includeCompensation: true;
    pinnedSpecificationVersion: {
      select: {
        title: true;
        location: true;
        jobDescription: true;
        mustHaveRequirements: true;
        publishedAt: true;
        structuredPayload: true;
        remotePolicy: true;
        compensationRange: true;
      };
    };
    job: {
      select: {
        company: { select: { name: true; publicSlug: true } };
      };
    };
  };
}>;

export function toCanonicalJobPosting(
  row: DistributionWithSpec,
): CanonicalJobPosting | null {
  const spec = row.pinnedSpecificationVersion;
  const applyUrl = row.applyUrlSnapshot;
  if (!spec || !applyUrl) return null;

  // Description: canonical JD, else must-haves as a minimal honest fallback.
  const description = (spec.jobDescription ?? spec.mustHaveRequirements ?? "").trim();
  if (!description) return null;

  const narrative = parseJobPostingNarrative(spec.structuredPayload);
  const employmentType =
    narrative?.employmentType ??
    inferEmploymentType({
      title: spec.title,
      companyName: row.job.company.name,
      location: spec.location,
      jobDescription: spec.jobDescription,
      experienceRange: null,
      numberOfPositions: null,
      compensationRange: null,
      mustHaveRequirements: spec.mustHaveRequirements,
      niceToHaveRequirements: null,
      primarySkills: null,
    });

  return {
    externalRef: `dist-${row.id}`,
    distributionId: row.id,
    title: spec.title,
    companyName: row.job.company.name,
    companyPublicSlug: row.job.company.publicSlug,
    location: spec.location?.trim() || null,
    employmentType,
    description,
    applyUrl,
    datePosted: spec.publishedAt ?? row.createdAt,
    // targetHireDate is an internal hiring target, not the posting's end date.
    validThrough: null,
    remotePolicy: spec.remotePolicy,
    compensationRange: row.includeCompensation ? spec.compensationRange : null,
  };
}

/** Minimal, well-known XML escaping for text nodes and attributes. */
export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
