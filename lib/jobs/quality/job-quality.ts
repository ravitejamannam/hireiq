/**
 * Job-quality checks used before publication and before a channel feed.
 * Errors block. Warnings are recommendations. Nothing here rewrites the job.
 */

export type JobQualityChannel =
  | "CAREERS"
  | "LINKEDIN_FEED"
  | "MANUAL";

export type JobQualityIssue = {
  code: string;
  field: string;
  severity: "error" | "warning";
  message: string;
};

export type JobQualityInput = {
  title: string;
  description: string;
  location?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  remote?: boolean | null;
  remotePolicy?: string | null;
  compensationRange?: string | null;
  companyName?: string | null;
  channel?: JobQualityChannel;
};

export type StructuredWorkplace = {
  remote: boolean;
  city: string | null;
  region: string | null;
  country: string | null;
};

const TITLE_MAX = 80;
const DESCRIPTION_MIN = 150;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function publicDesignation(title: string, companyName?: string | null) {
  const trimmed = title.trim();
  const prefix = companyName?.trim() ? `${companyName.trim()}: ` : "";
  if (prefix && trimmed.startsWith(prefix)) {
    return trimmed.slice(prefix.length).trim();
  }
  return trimmed;
}

/**
 * A title with two role names joined by a separator is more than one designation.
 * "Senior Backend Engineer" stays one designation.
 */
export function hasMultipleDesignations(title: string): boolean {
  const parts = title
    .split(/\s+(?:\/|\||\bor\b|&)\s+|\s*,\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return false;
  const role =
    /\b(engineer|developer|designer|manager|analyst|intern|lead|recruiter|scientist|architect|consultant|specialist|associate|director)\b/i;
  return parts.filter((part) => role.test(part)).length >= 2;
}

export function interpretWorkplace(input: {
  location?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  remote?: boolean | null;
  remotePolicy?: string | null;
}): StructuredWorkplace {
  const explicitCity = clean(input.city);
  const explicitRegion = clean(input.region);
  const explicitCountry = clean(input.country);
  const policyRemote = /remote|anywhere|distributed/i.test(input.remotePolicy ?? "");
  const location = clean(input.location) ?? "";

  if (explicitCity || explicitRegion || explicitCountry) {
    return {
      remote: input.remote === true || policyRemote || /^remote\b/i.test(location),
      city: explicitCity,
      region: explicitRegion,
      country: explicitCountry,
    };
  }

  if (/^remote\b/i.test(location)) {
    const rest = location.replace(/^remote\b[:\s,—-]*/i, "");
    const country =
      rest
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part && !/^remote$/i.test(part))
        .at(-1) ?? null;
    return { remote: true, city: null, region: null, country };
  }

  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 3) {
    return {
      remote: input.remote === true || policyRemote,
      city: parts[0] ?? null,
      region: parts[1] ?? null,
      country: parts[2] ?? null,
    };
  }

  return {
    remote: input.remote === true || policyRemote,
    city: null,
    region: null,
    country: null,
  };
}

export type ParsedSalary = {
  currency: string;
  minValue: number;
  maxValue: number;
  unitText: "HOUR" | "MONTH" | "YEAR";
};

function numberFrom(raw: string): number | null {
  const normalized = raw.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/**
 * Reads a salary only when the text already states a currency and a period.
 * LPA is treated as INR per year because that is what the abbreviation states.
 */
export function parsePublicSalary(value: string | null | undefined): ParsedSalary | null {
  const text = clean(value);
  if (!text) return null;

  const lpa = text.match(
    /(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*LPA\b/i,
  );
  if (lpa) {
    const min = numberFrom(lpa[1] ?? "");
    const max = numberFrom(lpa[2] ?? "");
    if (min == null || max == null || min <= 0 || max < min) return null;
    return {
      currency: "INR",
      minValue: Math.round(min * 100000),
      maxValue: Math.round(max * 100000),
      unitText: "YEAR",
    };
  }

  const amount = text.match(
    /(₹|INR|Rs\.?|USD|\$|EUR|€|GBP|£)\s*(\d[\d,]*(?:\.\d+)?)\s*(?:-|–|to)\s*(?:₹|INR|Rs\.?|USD|\$|EUR|€|GBP|£)?\s*(\d[\d,]*(?:\.\d+)?)/i,
  );
  if (!amount) return null;
  const min = numberFrom(amount[2] ?? "");
  const max = numberFrom(amount[3] ?? "");
  if (min == null || max == null || min <= 0 || max < min) return null;

  const symbol = amount[1] ?? "";
  const currency = /₹|INR|Rs/i.test(symbol)
    ? "INR"
    : /€|EUR/i.test(symbol)
      ? "EUR"
      : /£|GBP/i.test(symbol)
        ? "GBP"
        : "USD";
  const unitText: ParsedSalary["unitText"] = /hour/i.test(text)
    ? "HOUR"
    : /month/i.test(text)
      ? "MONTH"
      : /year|annum|p\.?a\.?/i.test(text)
        ? "YEAR"
        : "YEAR";
  if (!/hour|month|year|annum|p\.?a\.?/i.test(text)) return null;

  return { currency, minValue: min, maxValue: max, unitText };
}

export function validateJobQuality(input: JobQualityInput): {
  ok: boolean;
  errors: JobQualityIssue[];
  warnings: JobQualityIssue[];
} {
  const errors: JobQualityIssue[] = [];
  const warnings: JobQualityIssue[] = [];
  const title = publicDesignation(input.title, input.companyName);
  const description = input.description.trim();
  const workplace = interpretWorkplace(input);
  const channel = input.channel ?? "CAREERS";

  if (!title) {
    errors.push({
      code: "TITLE_REQUIRED",
      field: "title",
      severity: "error",
      message: "Add a job title before publication.",
    });
  } else if (title.length > TITLE_MAX) {
    errors.push({
      code: "TITLE_TOO_LONG",
      field: "title",
      severity: "error",
      message: `Shorten the title to ${TITLE_MAX} characters or fewer. It is ${title.length}.`,
    });
  }

  if (title && hasMultipleDesignations(title)) {
    errors.push({
      code: "MULTIPLE_DESIGNATIONS",
      field: "title",
      severity: "error",
      message:
        "Use one primary designation. Split combined titles such as “Engineer / Designer” into separate jobs.",
    });
  }

  if (description.length < DESCRIPTION_MIN) {
    errors.push({
      code: "DESCRIPTION_TOO_SHORT",
      field: "description",
      severity: "error",
      message: `Write a description of at least ${DESCRIPTION_MIN} characters. It is ${description.length}.`,
    });
  }

  if (workplace.remote) {
    if (!workplace.country) {
      errors.push({
        code: "REMOTE_COUNTRY_REQUIRED",
        field: "country",
        severity: "error",
        message:
          "Remote roles need the country applicants must be located in. HireIQ will not invent one.",
      });
    }
  } else if (!workplace.city || !workplace.region || !workplace.country) {
    errors.push({
      code: "LOCATION_INCOMPLETE",
      field: "location",
      severity: "error",
      message:
        "Add city, state, and country as separate parts, for example “Bengaluru, Karnataka, India”.",
    });
  }

  const compensation = clean(input.compensationRange);
  if (!compensation) {
    warnings.push({
      code: "SALARY_RECOMMENDED",
      field: "compensationRange",
      severity: "warning",
      message:
        "Salary is recommended when you are willing to publish it. Leave it blank if it should stay private.",
    });
  } else if (!parsePublicSalary(compensation)) {
    warnings.push({
      code: "SALARY_NOT_STRUCTURED",
      field: "compensationRange",
      severity: "warning",
      message:
        "This salary text will not be published as base salary until it includes a currency, a range, and a period such as per year.",
    });
  }

  if (channel === "LINKEDIN_FEED" && !clean(input.companyName)) {
    errors.push({
      code: "EMPLOYER_REQUIRED",
      field: "companyName",
      severity: "error",
      message: "The LinkedIn feed needs the employer’s company name.",
    });
  }

  return { ok: errors.length === 0, errors, warnings };
}
