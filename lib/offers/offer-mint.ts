import { createHash, randomBytes } from "crypto";

import type { OfferTermsInput } from "@/lib/offers/offer-acceptance";
import { prisma } from "@/lib/prisma";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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

/**
 * Mint an offer link for an application that is already known to be
 * authorized. Company and job come from the application row.
 */
export async function mintOfferForAuthorizedAdmin(
  applicationId: number,
  terms: OfferTermsInput = {},
): Promise<
  | { ok: true; acceptUrlPath: string; applicationId: number; companyId: number }
  | { ok: false; error: string }
> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      companyId: true,
      jobId: true,
      status: true,
      offerAcceptedAt: true,
    },
  });
  if (!application) {
    return { ok: false, error: "Application was not found." };
  }
  if (application.status !== "SELECTED" && application.status !== "HIRED") {
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
  const updated = await prisma.application.update({
    where: { id: application.id },
    data: {
      offerAcceptanceTokenHash: sha256Hex(rawToken),
      offerMintedAt: new Date(),
      offerDeclinedAt: null,
      offerTerms: trimToNull(terms.terms),
      offerCompensation: trimToNull(terms.compensation, 200),
      proposedStartDate,
    },
    select: { id: true, companyId: true, jobId: true },
  });
  if (updated.companyId !== application.companyId || updated.jobId !== application.jobId) {
    return { ok: false, error: "Application was not found." };
  }

  return {
    ok: true,
    acceptUrlPath: `/offer/${rawToken}`,
    applicationId: updated.id,
    companyId: updated.companyId,
  };
}
