import { createHash, randomBytes } from "crypto";

import { requireAdmin, AuthorizationError } from "@/lib/auth/authorization";
import { commitOfferDecision } from "@/lib/outcomes/outcome-event-writes";
import { prisma } from "@/lib/prisma";

/**
 * T133 offer acceptance (DocuSign-free e-sign).
 *
 * Admin mints a single-use acceptance link for a SELECTED/HIRED
 * application. The raw token is shown once; only its SHA-256 hash is
 * stored (same pattern as apply/assessment tokens). The candidate's
 * accept page verifies the hash and records the acceptance timestamp.
 *
 * The link is bound to the application id — guessing tokens across
 * applications is infeasible (256-bit random).
 */

export type OfferTermsInput = {
  terms?: string | null;
  compensation?: string | null;
  proposedStartDate?: string | null;
};

export type OfferAcceptanceResult =
  | { ok: true; acceptUrlPath: string }
  | { ok: false; error: string };

const offerPublicSelect = {
  id: true,
  offerAcceptedAt: true,
  offerDeclinedAt: true,
  offerTerms: true,
  offerCompensation: true,
  proposedStartDate: true,
  candidate: { select: { name: true, location: true, expectedCTC: true } },
  job: {
    select: {
      title: true,
      location: true,
      company: { select: { name: true } },
    },
  },
} as const;

export type PublicOfferRecord = {
  id: number;
  offerAcceptedAt: Date | null;
  offerDeclinedAt: Date | null;
  offerTerms: string | null;
  offerCompensation: string | null;
  proposedStartDate: Date | null;
  candidate: { name: string; location: string | null; expectedCTC: string | null };
  job: {
    title: string;
    location: string | null;
    company: { name: string };
  };
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function isOfferTokenShape(rawToken: string): boolean {
  return /^offer_[a-f0-9]{48}$/.test(rawToken);
}

function parseProposedStartDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function trimToNull(value: string | null | undefined, max = 4000): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function findApplicationByOfferToken(
  rawToken: string,
): Promise<PublicOfferRecord | null> {
  if (!isOfferTokenShape(rawToken)) return null;
  return prisma.application.findUnique({
    where: { offerAcceptanceTokenHash: sha256Hex(rawToken) },
    select: offerPublicSelect,
  });
}

export async function mintOfferAcceptance(
  applicationId: number,
  terms: OfferTermsInput = {},
): Promise<OfferAcceptanceResult> {
  let companyId: number | null;
  try {
    const admin = await requireAdmin();
    companyId = admin.companyId;
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, error: "Admin access required." };
    }
    throw error;
  }
  if (!companyId) return { ok: false, error: "No workspace found." };

  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      companyId,
      status: { in: ["SELECTED", "HIRED"] },
    },
    select: { id: true, offerAcceptedAt: true },
  });
  if (!application) {
    return {
      ok: false,
      error: "Application must be SELECTED or HIRED before minting an offer link.",
    };
  }
  if (application.offerAcceptedAt) {
    return { ok: false, error: "This offer has already been accepted." };
  }

  const proposedStartDate = parseProposedStartDate(terms.proposedStartDate);
  if (terms.proposedStartDate?.trim() && !proposedStartDate) {
    return { ok: false, error: "Proposed start date is invalid." };
  }

  const rawToken = `offer_${randomBytes(24).toString("hex")}`;
  await prisma.application.update({
    where: { id: application.id },
    data: {
      offerAcceptanceTokenHash: sha256Hex(rawToken),
      offerMintedAt: new Date(),
      offerDeclinedAt: null,
      offerTerms: trimToNull(terms.terms),
      offerCompensation: trimToNull(terms.compensation, 200),
      proposedStartDate,
    },
  });

  return { ok: true, acceptUrlPath: `/offer/${rawToken}` };
}

/**
 * Public verification + acceptance. Idempotent-safe: accepting twice
 * returns the original timestamp without error.
 */
export async function acceptOffer(
  rawToken: string,
): Promise<
  | {
      ok: true;
      alreadyAccepted: boolean;
      acceptedAt: Date | null;
      candidateName: string;
      jobTitle: string;
      companyName: string;
    }
  | { ok: false; error: string }
> {
  const application = await findApplicationByOfferToken(rawToken);
  if (!application) {
    return { ok: false, error: "This offer link is invalid or was revoked." };
  }

  if (application.offerDeclinedAt) {
    return { ok: false, error: "This offer was declined." };
  }

  if (application.offerAcceptedAt) {
    return {
      ok: true,
      alreadyAccepted: true,
      acceptedAt: application.offerAcceptedAt,
      candidateName: application.candidate.name,
      jobTitle: application.job.title,
      companyName: application.job.company.name,
    };
  }

  const now = new Date();
  const updated = await prisma.$transaction((tx) =>
    commitOfferDecision(tx, {
      applicationId: application.id,
      decision: "ACCEPTED",
      occurredAt: now,
    }),
  );

  if (updated === 0) {
    const latest = await prisma.application.findUnique({
      where: { id: application.id },
      select: { offerAcceptedAt: true, offerDeclinedAt: true },
    });
    if (latest?.offerDeclinedAt) {
      return { ok: false, error: "This offer was declined." };
    }
    return {
      ok: true,
      alreadyAccepted: true,
      acceptedAt: latest?.offerAcceptedAt ?? null,
      candidateName: application.candidate.name,
      jobTitle: application.job.title,
      companyName: application.job.company.name,
    };
  }

  return {
    ok: true,
    alreadyAccepted: false,
    acceptedAt: now,
    candidateName: application.candidate.name,
    jobTitle: application.job.title,
    companyName: application.job.company.name,
  };
}

export async function declineOffer(
  rawToken: string,
): Promise<
  | {
      ok: true;
      alreadyDeclined: boolean;
      declinedAt: Date | null;
      candidateName: string;
      jobTitle: string;
      companyName: string;
    }
  | { ok: false; error: string }
> {
  const application = await findApplicationByOfferToken(rawToken);
  if (!application) {
    return { ok: false, error: "This offer link is invalid or was revoked." };
  }

  if (application.offerAcceptedAt) {
    return { ok: false, error: "This offer was already accepted." };
  }

  if (application.offerDeclinedAt) {
    return {
      ok: true,
      alreadyDeclined: true,
      declinedAt: application.offerDeclinedAt,
      candidateName: application.candidate.name,
      jobTitle: application.job.title,
      companyName: application.job.company.name,
    };
  }

  const now = new Date();
  const updated = await prisma.$transaction((tx) =>
    commitOfferDecision(tx, {
      applicationId: application.id,
      decision: "DECLINED",
      occurredAt: now,
    }),
  );

  if (updated === 0) {
    const latest = await prisma.application.findUnique({
      where: { id: application.id },
      select: { offerAcceptedAt: true, offerDeclinedAt: true },
    });
    if (latest?.offerAcceptedAt) {
      return { ok: false, error: "This offer was already accepted." };
    }
    return {
      ok: true,
      alreadyDeclined: true,
      declinedAt: latest?.offerDeclinedAt ?? null,
      candidateName: application.candidate.name,
      jobTitle: application.job.title,
      companyName: application.job.company.name,
    };
  }

  return {
    ok: true,
    alreadyDeclined: false,
    declinedAt: now,
    candidateName: application.candidate.name,
    jobTitle: application.job.title,
    companyName: application.job.company.name,
  };
}
