import { ApplicationIngestionError } from "@/lib/ingestion/ingestion-errors";
import {
  ingestIndeedApplication,
  type SafeIndeedIngestionEvent,
} from "@/lib/ingestion/indeed-ingestion";
import {
  INDEED_POSTING_NOT_FOUND,
  INDEED_WEBHOOK_INVALID_SIGNATURE,
  INDEED_WEBHOOK_MALFORMED,
  INDEED_WEBHOOK_UNCONFIGURED,
} from "@/lib/jobs/distribution/indeed/errors";
import {
  computeIndeedApplySignature,
  indeedSignaturesMatch,
  readIndeedApplyWebhookSecret,
} from "@/lib/jobs/distribution/indeed/signature";

export class IndeedWebhookError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(message: string, code: string, httpStatus: number) {
    super(message);
    this.name = "IndeedWebhookError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

type IndeedApplyApplicant = {
  fullName?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phoneNumber?: unknown;
  resume?: unknown;
};

type IndeedApplyJob = {
  jobId?: unknown;
  jobCompany?: unknown;
  jobTitle?: unknown;
  jobUrl?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function applicantName(applicant: IndeedApplyApplicant) {
  if (typeof applicant.fullName === "string" && applicant.fullName.trim()) {
    return applicant.fullName.trim();
  }
  const first =
    typeof applicant.firstName === "string" ? applicant.firstName.trim() : "";
  const last =
    typeof applicant.lastName === "string" ? applicant.lastName.trim() : "";
  const joined = `${first} ${last}`.trim();
  return joined || null;
}

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const email = value.trim().toLowerCase();
  return email || null;
}

function locationFromResumeJson(resume: unknown) {
  const resumeObj = asRecord(resume);
  const json = asRecord(resumeObj?.json);
  const location = asRecord(json?.location);
  if (!location) {
    return null;
  }
  const city = typeof location.city === "string" ? location.city.trim() : "";
  const country =
    typeof location.country === "string" ? location.country.trim() : "";
  const parts = [city, country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/**
 * Parse documented Indeed Apply JSON after HMAC verification.
 * Resume Base64 is read only to extract optional location, then discarded.
 */
function parseIndeedApplyBody(rawBody: string): {
  id: string;
  jobPostingId: string;
  applicantName: string;
  applicantEmailNormalized: string;
  applicantPhone: string | null;
  applicantLocation: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new IndeedWebhookError(
      "Malformed webhook body.",
      INDEED_WEBHOOK_MALFORMED,
      400,
    );
  }

  const body = asRecord(parsed);
  if (!body) {
    throw new IndeedWebhookError(
      "Malformed webhook body.",
      INDEED_WEBHOOK_MALFORMED,
      400,
    );
  }

  if (typeof body.id !== "string" || !body.id.trim()) {
    throw new IndeedWebhookError(
      "Malformed webhook body.",
      INDEED_WEBHOOK_MALFORMED,
      400,
    );
  }

  const applicant = asRecord(body.applicant) as IndeedApplyApplicant | null;
  if (!applicant) {
    throw new IndeedWebhookError(
      "Malformed webhook body.",
      INDEED_WEBHOOK_MALFORMED,
      400,
    );
  }

  const name = applicantName(applicant);
  const email = normalizeEmail(applicant.email);
  if (!name || !email) {
    throw new IndeedWebhookError(
      "Malformed webhook body.",
      INDEED_WEBHOOK_MALFORMED,
      400,
    );
  }

  const job = asRecord(body.job) as IndeedApplyJob | null;
  if (!job || typeof job.jobId !== "string" || !job.jobId.trim()) {
    throw new IndeedWebhookError(
      "Malformed webhook body.",
      INDEED_WEBHOOK_MALFORMED,
      400,
    );
  }

  void job.jobCompany;
  void job.jobTitle;
  void job.jobUrl;
  void body.companyId;

  return {
    id: body.id.trim(),
    jobPostingId: job.jobId.trim(),
    applicantName: name,
    applicantEmailNormalized: email,
    applicantPhone:
      typeof applicant.phoneNumber === "string" && applicant.phoneNumber.trim()
        ? applicant.phoneNumber.trim()
        : null,
    applicantLocation: locationFromResumeJson(applicant.resume),
  };
}

export async function processIndeedWebhook(input: {
  rawBody: string;
  signature: string | null;
  companyIdFromBrowser?: unknown;
  jobIdFromBrowser?: unknown;
}): Promise<{ ok: true; event: SafeIndeedIngestionEvent }> {
  void input.companyIdFromBrowser;
  void input.jobIdFromBrowser;

  const secret = readIndeedApplyWebhookSecret();
  if (!secret) {
    throw new IndeedWebhookError(
      "Indeed Apply webhook is not configured.",
      INDEED_WEBHOOK_UNCONFIGURED,
      503,
    );
  }

  const expected = computeIndeedApplySignature(input.rawBody, secret);
  if (!indeedSignaturesMatch(input.signature, expected)) {
    throw new IndeedWebhookError(
      "Invalid webhook signature.",
      INDEED_WEBHOOK_INVALID_SIGNATURE,
      401,
    );
  }

  const envelope = parseIndeedApplyBody(input.rawBody);

  try {
    const event = await ingestIndeedApplication({
      jobPostingId: envelope.jobPostingId,
      externalApplicationId: envelope.id,
      applicantName: envelope.applicantName,
      applicantEmailNormalized: envelope.applicantEmailNormalized,
      applicantPhone: envelope.applicantPhone,
      applicantLocation: envelope.applicantLocation,
      companyIdFromBrowser: input.companyIdFromBrowser,
      jobIdFromBrowser: input.jobIdFromBrowser,
    });
    return { ok: true, event };
  } catch (error) {
    if (
      error instanceof ApplicationIngestionError &&
      error.code === INDEED_POSTING_NOT_FOUND
    ) {
      throw new IndeedWebhookError(
        "Unknown Indeed posting.",
        INDEED_POSTING_NOT_FOUND,
        404,
      );
    }
    throw error;
  }
}
