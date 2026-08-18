"use server";

import { AuthorizationError, requireAdmin } from "@/lib/auth/authorization";
import type { Recommendation } from "@prisma/client";

function denyReportWrite(): never {
  throw new AuthorizationError("Reports are not a product object.");
}

export async function createReport(
  applicationId: number,
  recommendation: Recommendation,
  notes: string | null,
) {
  await requireAdmin();
  denyReportWrite();
  void applicationId;
  void recommendation;
  void notes;
}

export async function updateReport(
  id: number,
  applicationId: number,
  recommendation: Recommendation,
  notes: string | null,
) {
  await requireAdmin();
  denyReportWrite();
  void id;
  void applicationId;
  void recommendation;
  void notes;
}

export async function deleteReport(id: number) {
  await requireAdmin();
  denyReportWrite();
  void id;
}
