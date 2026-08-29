"use server";

import { revalidatePath } from "next/cache";

import { mintOfferAcceptance } from "@/lib/offers/offer-acceptance";

export async function mintOfferAcceptanceAction(
  applicationId: number,
  terms?: {
    terms?: string;
    compensation?: string;
    proposedStartDate?: string;
  },
) {
  const result = await mintOfferAcceptance(applicationId, terms ?? {});
  if (result.ok) revalidatePath("/dashboard/requirements");
  return result;
}
