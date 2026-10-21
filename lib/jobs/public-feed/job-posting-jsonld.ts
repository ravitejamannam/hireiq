import type { EmploymentType } from "@/lib/jobs/job-posting-view";
import {
  interpretWorkplace,
  parsePublicSalary,
  publicDesignation,
  type StructuredWorkplace,
} from "@/lib/jobs/quality/job-quality";

const SCHEMA_EMPLOYMENT: Record<EmploymentType, string> = {
  FULL_TIME: "FULL_TIME",
  PART_TIME: "PART_TIME",
  CONTRACT: "CONTRACTOR",
  INTERNSHIP: "INTERN",
};

export type JobPostingJsonLdInput = {
  title: string;
  companyName: string;
  description: string;
  datePosted: Date;
  validThrough?: Date | null;
  location?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  remote?: boolean | null;
  remotePolicy?: string | null;
  compensationRange?: string | null;
  employmentType?: EmploymentType | null;
  /** Absolute URL of this public job page. */
  postingUrl?: string | null;
  /** Absolute URL candidates use to apply. */
  applyUrl?: string | null;
};

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function descriptionHtml(description: string) {
  const paragraphs = description
    .split(/\n{2,}|\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`);
  return paragraphs.join("");
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function sameOrigin(left: string | null | undefined, right: string | null | undefined) {
  if (!left || !right) return false;
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

function locationNode(workplace: StructuredWorkplace) {
  if (!workplace.city || !workplace.region || !workplace.country) return null;
  return {
    "@type": "Place",
    address: {
      "@type": "PostalAddress",
      addressLocality: workplace.city,
      addressRegion: workplace.region,
      addressCountry: workplace.country,
    },
  };
}

/**
 * schema.org JobPosting from structured job fields.
 * Omits location, salary, validThrough, and directApply when the source data
 * does not support them. Does not add HireIQ as the hiring organization.
 */
export function buildJobPostingJsonLd(input: JobPostingJsonLdInput) {
  const title = publicDesignation(input.title, input.companyName);
  const workplace = interpretWorkplace(input);
  const place = locationNode(workplace);
  const salary = parsePublicSalary(input.compensationRange);
  const directApply =
    Boolean(input.applyUrl) &&
    Boolean(input.postingUrl) &&
    sameOrigin(input.applyUrl, input.postingUrl);

  const posting: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title,
    description: descriptionHtml(input.description),
    datePosted: input.datePosted.toISOString().slice(0, 10),
    hiringOrganization: {
      "@type": "Organization",
      name: input.companyName,
    },
    directApply,
  };

  if (input.employmentType) {
    posting.employmentType = SCHEMA_EMPLOYMENT[input.employmentType];
  }
  if (input.validThrough && input.validThrough.getTime() > Date.now()) {
    posting.validThrough = input.validThrough.toISOString().slice(0, 10);
  }
  if (input.postingUrl) {
    posting.url = input.postingUrl;
  }
  if (place) {
    posting.jobLocation = place;
  }
  if (workplace.remote && workplace.country) {
    posting.jobLocationType = "TELECOMMUTE";
    posting.applicantLocationRequirements = {
      "@type": "Country",
      name: workplace.country,
    };
  }
  if (salary) {
    posting.baseSalary = {
      "@type": "MonetaryAmount",
      currency: salary.currency,
      value: {
        "@type": "QuantitativeValue",
        minValue: salary.minValue,
        maxValue: salary.maxValue,
        unitText: salary.unitText,
      },
    };
  }

  return posting;
}
