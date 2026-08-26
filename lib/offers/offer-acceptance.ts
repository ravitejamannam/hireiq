import { createHash, randomBytes } from "crypto";

import { requireAdmin, AuthorizationError } from "@/lib/auth/authorization";
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

export type OfferAcceptanceResult =
  | { ok: true; acceptUrlPath: string }
  | { ok: false; error: string };

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function mintOfferAcceptance(
  applicationId: number,
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

  const rawToken = `offer_${randomBytes(24).toString("hex")}`;
  await prisma.application.update({
    where: { id: application.id },
    data: { offerAcceptanceTokenHash: sha256Hex(rawToken) },
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
  | { ok: true; alreadyAccepted: boolean; acceptedAt: Date | null; candidateName: string; jobTitle: string; companyName: string }
  | { ok: false; error: string }
> {
  if (!/^offer_[a-f0-9]{48}$/.test(rawToken)) {
    return { ok: false, error: "Invalid offer link." };
  }

  const application = await prisma.application.findUnique({
    where: { offerAcceptanceTokenHash: sha256Hex(rawToken) },
    select: {
      id: true,
      offerAcceptedAt: true,
      candidate: { select: { name: true } },
      job: {
        select: { title: true, company: { select: { name: true } } },
      },
    },
  });
  if (!application) {
    return { ok: false, error: "This offer link is invalid or was revoked." };
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

  const updated = await prisma.application.updateMany({
    // Guarded update: only stamp when not already accepted (race-safe).
    where: { id: application.id, offerAcceptedAt: null },
    data: { offerAcceptedAt: new Date() },
  });

  const acceptedAt = updated.count > 0 ? new Date() : application.offerAcceptedAt;
  return {
    ok: true,
    alreadyAccepted: updated.count === 0,
    acceptedAt,
    candidateName: application.candidate.name,
    jobTitle: application.job.title,
    companyName: application.job.company.name,
  };
}
