"use server";

import { revalidatePath } from "next/cache";

import { AuthenticationError } from "@/lib/auth/authorization";
import {
  getLatestReconciliationHealth,
  runReconciliationSweepForAdmin,
} from "@/lib/jobs/distribution/reconciliation";

export async function getReconciliationHealth() {
  return getLatestReconciliationHealth();
}

export async function triggerReconciliationSweep() {
  try {
    const summary = await runReconciliationSweepForAdmin({});
    revalidatePath("/dashboard/integrations");
    return { ok: true as const, summary };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    return {
      ok: false as const,
      error: "Reconciliation sweep failed. Check server logs for details.",
    };
  }
}
