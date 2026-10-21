"use server";

import { PortalRole } from "@prisma/client";

import {
  AuthorizationError,
  deniesCrossCompany,
  requireJobAccess,
  requireUser,
} from "@/lib/auth/authorization";
import {
  confirmApplicantImport,
  listImportBatches,
  listImportTemplates,
  previewApplicantFile,
  saveImportTemplate,
} from "@/lib/imports/import-service";
import { mappingFromTemplate, type ImportMapping } from "@/lib/imports/import-mapping";

async function authorizeJob(jobId: number) {
  const user = await requireUser();
  if (user.role === PortalRole.INTERVIEWER) {
    throw new AuthorizationError("Resource not found.");
  }
  const { job } = await requireJobAccess(jobId);
  if (deniesCrossCompany(user, job.companyId)) {
    throw new AuthorizationError("Resource not found.");
  }
  return { user, companyId: job.companyId };
}

function jobIdFrom(formData: FormData) {
  const value = Number(formData.get("jobId"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function fileFrom(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  return { filename: file.name, bytes };
}

export async function previewImportAction(formData: FormData) {
  try {
    const jobId = jobIdFrom(formData);
    const file = await fileFrom(formData);
    if (!jobId || !file) return { ok: false as const, error: "Choose a job and a CSV or XLSX file." };
    const { companyId } = await authorizeJob(jobId);
    const mapping = mappingFromTemplate(JSON.parse(String(formData.get("mapping") || "{}")));
    return previewApplicantFile({
      companyId,
      jobId,
      filename: file.filename,
      bytes: file.bytes,
      mapping,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false as const, error: "You cannot import into this job." };
    return { ok: false as const, error: "The file could not be read." };
  }
}

export async function confirmImportAction(formData: FormData) {
  try {
    const jobId = jobIdFrom(formData);
    const file = await fileFrom(formData);
    if (!jobId || !file) return { ok: false as const, error: "Choose a job and a CSV or XLSX file." };
    const { user, companyId } = await authorizeJob(jobId);
    const mapping = mappingFromTemplate(JSON.parse(String(formData.get("mapping") || "{}")));
    if (!mapping?.name) return { ok: false as const, error: "Map a name column before importing." };
    const decisions = JSON.parse(String(formData.get("decisions") || "{}")) as Record<string, number | "new">;
    return confirmApplicantImport({
      companyId,
      actorUserId: user.id,
      actorRole: user.role,
      jobId,
      filename: file.filename,
      bytes: file.bytes,
      mapping,
      decisions,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false as const, error: "You cannot import into this job." };
    return { ok: false as const, error: "Import did not finish. You can submit the same file again." };
  }
}

export async function saveImportTemplateAction(formData: FormData) {
  try {
    const jobId = jobIdFrom(formData);
    if (!jobId) return { ok: false as const, error: "Job not found." };
    const { user, companyId } = await authorizeJob(jobId);
    return saveImportTemplate({
      companyId,
      actorUserId: user.id,
      name: String(formData.get("templateName") || ""),
      mapping: JSON.parse(String(formData.get("mapping") || "{}")),
    });
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false as const, error: "You cannot save a template for this job." };
    return { ok: false as const, error: "Template was not saved." };
  }
}

export async function loadImportContext(jobId: number) {
  const { companyId } = await authorizeJob(jobId);
  const [templates, batches] = await Promise.all([
    listImportTemplates(companyId),
    listImportBatches(companyId, jobId),
  ]);
  return { templates, batches };
}

export type { ImportMapping };
