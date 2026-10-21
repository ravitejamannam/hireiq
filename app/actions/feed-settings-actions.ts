"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth/authorization";
import { prisma } from "@/lib/prisma";

function companyIdFrom(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number.parseInt(value, 10);
  return id > 0 ? id : null;
}

function checked(value: FormDataEntryValue | null) {
  return value === "on";
}

export async function updateCompanyPublicFeeds(formData: FormData) {
  await requireAdmin();
  const companyId = companyIdFrom(formData.get("companyId"));
  if (!companyId) {
    redirect("/dashboard/integrations/feeds?feedError=company");
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) {
    redirect("/dashboard/integrations/feeds?feedError=company");
  }

  const jobsFeedEnabled = checked(formData.get("jobsFeedEnabled"));
  const linkedInRequested = checked(formData.get("linkedInFeedEnabled"));
  const linkedInCompanyId = String(formData.get("linkedInCompanyId") ?? "").trim().slice(0, 64);
  const linkedInPosterEmail = String(formData.get("linkedInPosterEmail") ?? "")
    .trim()
    .slice(0, 200);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(linkedInPosterEmail);
  const linkedInReady = linkedInCompanyId.length > 0 && emailOk;

  if (linkedInRequested && !linkedInReady) {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        jobsFeedEnabled,
        linkedInFeedEnabled: false,
        linkedInCompanyId: linkedInCompanyId || null,
        linkedInPosterEmail: linkedInPosterEmail || null,
      },
    });
    revalidatePath("/dashboard/integrations/feeds");
    redirect(
      `/dashboard/integrations/feeds?company=${companyId}&feedError=linkedin`,
    );
  }

  await prisma.company.update({
    where: { id: companyId },
    data: {
      jobsFeedEnabled,
      linkedInFeedEnabled: linkedInRequested,
      linkedInCompanyId: linkedInCompanyId || null,
      linkedInPosterEmail: linkedInPosterEmail || null,
    },
  });
  revalidatePath("/dashboard/integrations/feeds");
  redirect(`/dashboard/integrations/feeds?company=${companyId}&feedSaved=1`);
}
