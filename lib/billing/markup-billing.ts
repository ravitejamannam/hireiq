import { revalidatePath } from "next/cache";

import { requireAdmin, AuthorizationError } from "@/lib/auth/authorization";
import { computeMarkupFeeCents } from "@/lib/billing/markup-math";
import { prisma } from "@/lib/prisma";

export { computeMarkupFeeCents, formatCents } from "@/lib/billing/markup-math";

/**
 * T132 Transparent markup billing (Bullhorn model, honesty twist).
 *
 * The workspace sets ONE number — the agency markup in basis points.
 * When a placement's compensation is recorded, the fee is computed as
 *
 *     fee = placedCtc * markupBps / 10_000
 *
 * and ALL THREE numbers are snapshotted onto the line item so clients
 * see exactly: base × rate = fee. No hidden math, ever.
 */

export type MarkupResult =
  | {
      ok: true;
      placedCtcCents: number;
      markupBps: number;
      feeCents: number;
    }
  | { ok: false; error: string };

// Audit fix: was 10x too small (₹1 crore) despite the comment —
// legitimate senior placements would have been rejected.
const MAX_CTC_CENTS = 10_000_000_000; // ₹10 crore sanity cap
export const MAX_MARKUP_BPS = 50_000; // 500% sanity cap

export async function setAgencyMarkup(
  markupBps: number,
): Promise<MarkupResult | { ok: true; markupBps: number }> {
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

  if (!Number.isInteger(markupBps) || markupBps < 0 || markupBps > MAX_MARKUP_BPS) {
    return { ok: false, error: "Markup must be between 0 and 500%." };
  }

  await prisma.company.update({
    where: { id: companyId },
    data: { agencyMarkupBps: markupBps },
  });
  revalidatePath("/dashboard/billing");
  revalidatePath("/client/billing");
  return { ok: true, markupBps };
}

export async function recordPlacementCompensation(
  applicationId: number,
  placedCtcCents: number,
): Promise<MarkupResult> {
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

  if (!Number.isInteger(placedCtcCents) || placedCtcCents <= 0 || placedCtcCents > MAX_CTC_CENTS) {
    return { ok: false, error: "Placed compensation out of range." };
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { agencyMarkupBps: true },
  });
  if (!company?.agencyMarkupBps) {
    return {
      ok: false,
      error: "Set your agency markup first (Workspace settings).",
    };
  }

  const lineItem = await prisma.billingLineItem.findFirst({
    where: { applicationId, billingRecord: { companyId } },
    select: { id: true },
  });
  if (!lineItem) {
    return { ok: false, error: "No billing line item for this placement yet." };
  }

  const markupBps = company.agencyMarkupBps;
  const feeCents = computeMarkupFeeCents(placedCtcCents, markupBps);

  await prisma.billingLineItem.update({
    where: { id: lineItem.id },
    data: {
      placedCtcCents,
      markupBps,
      feeCents,
      compensationRecordedAt: new Date(),
    },
  });

  revalidatePath("/dashboard/billing");
  revalidatePath(`/dashboard/billing`);
  revalidatePath("/client/billing");
  return { ok: true, placedCtcCents, markupBps, feeCents };
}
