"use server";

import { revalidatePath } from "next/cache";

import { mintOfferAcceptance } from "@/lib/offers/offer-acceptance";

export async function mintOfferAcceptanceAction(applicationId: number) {
  const result = await mintOfferAcceptance(applicationId);
  if (result.ok) revalidatePath("/dashboard/requirements");
  return result;
}
