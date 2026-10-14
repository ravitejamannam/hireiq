import { createHash } from "crypto";

import { requireAdmin, AuthorizationError } from "@/lib/auth/authorization";
import { commitOfferDecision } from "@/lib/outcomes/outcome-event-writes";
import { mintOfferForAuthorizedAdmin } from "@/lib/offers/offer-mint";
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
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return { ok: false, error: "Admin access required." };
    }
    throw error;
  }

  const minted = await mintOfferForAuthorizedAdmin(applicationId, terms);
  if (!minted.ok) return minted;
  return { ok: true, acceptUrlPath: minted.acceptUrlPath };
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
