import { Prisma } from "@prisma/client";

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

export const CANONICAL_FEED_VERSION = 1;

export type CanonicalJobPosting = {
  externalRef: string; // stable public reference: distribution id
  title: string;
  companyName: string;
  location: string | null;
  description: string;
  applyUrl: string;
  datePosted: Date;
  validThrough: Date | null;
};

type DistributionWithSpec = Prisma.JobDistributionGetPayload<{
  select: {
    id: true;
    createdAt: true;
    applyUrlSnapshot: true;
    pinnedSpecificationVersion: {
      select: {
        title: true;
        location: true;
        jobDescription: true;
        mustHaveRequirements: true;
        publishedAt: true;
        targetHireDate: true;
      };
    };
    job: {
      select: {
        company: { select: { name: true } };
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

  return {
    externalRef: `dist-${row.id}`,
    title: spec.title,
    companyName: row.job.company.name,
    location: spec.location?.trim() || null,
    description,
    applyUrl,
    datePosted: spec.publishedAt ?? row.createdAt,
    validThrough:
      spec.targetHireDate && spec.targetHireDate > new Date()
        ? spec.targetHireDate
        : null,
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
