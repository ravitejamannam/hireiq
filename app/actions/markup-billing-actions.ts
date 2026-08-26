"use server";

import { revalidatePath } from "next/cache";

import {
  recordPlacementCompensation,
  setAgencyMarkup,
} from "@/lib/billing/markup-billing";

export async function setAgencyMarkupAction(markupBps: number) {
  const result = await setAgencyMarkup(markupBps);
  if (result.ok) revalidatePath("/dashboard/billing");
  return result;
}

export async function recordPlacementCompensationAction(
  applicationId: number,
  placedCtcCents: number,
) {
  const result = await recordPlacementCompensation(applicationId, placedCtcCents);
  if (result.ok) {
    revalidatePath("/dashboard/billing");
    revalidatePath("/client/billing");
  }
  return result;
}
