import { createHash } from "node:crypto";
import {
  ApplicantImportRowStatus,
  ApplicantImportStatus,
  CandidateStatus,
  SourcingDatabaseSource,
  type Prisma,
} from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { buildImportPreview, type KnownCandidate, type PreviewRow } from "@/lib/imports/import-preview";
import {
  mappingFromTemplate,
  normalizeEmail,
  phoneDigits,
  type ImportMapping,
} from "@/lib/imports/import-mapping";
import { parseSpreadsheet } from "@/lib/imports/spreadsheet";
import { prisma } from "@/lib/prisma";

export type ImportDecision = number | "new";

function idempotencyKey(input: {
  companyId: number;
  jobId: number;
  fileSha256: string;
  mapping: ImportMapping;
  decisions: Record<string, ImportDecision>;
}) {
  const mapping = JSON.stringify(Object.entries(input.mapping).sort(([a], [b]) => a.localeCompare(b)));
  const decisions = JSON.stringify(
    Object.entries(input.decisions).sort(([a], [b]) => Number(a) - Number(b)),
  );
  return createHash("sha256")
    .update(`${input.companyId}:${input.jobId}:${input.fileSha256}:${mapping}:${decisions}`)
    .digest("hex");
}

function safeFileName(name: string) {
  const base = name.split(/[/\\]/).pop()?.replace(/[^\w.\- ]+/g, "") ?? "import";
  return base.slice(0, 80) || "import";
}

export async function loadKnownCandidates(
  companyId: number,
  sheetEmails: string[],
  sheetNames: string[],
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const emails = [...new Set(sheetEmails)];
  const names = [...new Set(sheetNames.map((name) => name.trim()).filter((name) => name.length >= 2))].slice(0, 500);
  const [events, identities, named] = await Promise.all([
    emails.length
      ? db.applicationIngestionEvent.findMany({
          where: { companyId, applicantEmailNormalized: { in: emails } },
          select: {
            candidateId: true,
            applicantName: true,
            applicantEmailNormalized: true,
            applicantPhone: true,
            candidate: { select: { name: true, currentEmployer: true, erasedAt: true, companyId: true } },
          },
          take: 1000,
        })
      : [],
    emails.length
      ? db.candidatePortalIdentity.findMany({
          where: { companyId, emailNormalized: { in: emails } },
          select: {
            candidateId: true,
            emailNormalized: true,
            candidate: { select: { name: true, currentEmployer: true, erasedAt: true, companyId: true } },
          },
          take: 1000,
        })
      : [],
    names.length
      ? db.candidate.findMany({
          where: { companyId, name: { in: names, mode: "insensitive" } },
          select: { id: true, name: true, currentEmployer: true, erasedAt: true, companyId: true },
          take: 500,
        })
      : [],
  ]);

  const knownRows = new Map<string, KnownCandidate>();
  function add(candidate: KnownCandidate, email: string | null, phone: string | null) {
    rememberKnownCandidate(knownRows, candidate, email, phone);
  }

  for (const event of events) {
    if (!event.candidateId || !event.candidate) continue;
    add(
      {
        candidateId: event.candidateId,
        companyId: event.candidate.companyId,
        name: event.candidate.name,
        email: null,
        phoneDigits: null,
        currentEmployer: event.candidate.currentEmployer,
        erased: event.candidate.erasedAt != null,
      },
      event.applicantEmailNormalized,
      event.applicantPhone ? phoneDigits(event.applicantPhone) : null,
    );
  }
  for (const identity of identities) {
    add(
      {
        candidateId: identity.candidateId,
        companyId: identity.candidate.companyId,
        name: identity.candidate.name,
        email: null,
        phoneDigits: null,
        currentEmployer: identity.candidate.currentEmployer,
        erased: identity.candidate.erasedAt != null,
      },
      identity.emailNormalized,
      null,
    );
  }
  for (const candidate of named) {
    add(
      {
        candidateId: candidate.id,
        companyId: candidate.companyId,
        name: candidate.name,
        email: null,
        phoneDigits: null,
        currentEmployer: candidate.currentEmployer,
        erased: candidate.erasedAt != null,
      },
      null,
      null,
    );
  }
  return [...knownRows.values()];
}

/**
 * One row per candidate and email. A person can have more than one address.
 * Collapsing those addresses onto a single field hides a shared address and
 * lets an import attach that row to the wrong person.
 */
export function rememberKnownCandidate(
  rows: Map<string, KnownCandidate>,
  candidate: {
    candidateId: number;
    companyId: number;
    name: string;
    currentEmployer: string | null;
    erased: boolean;
  },
  email: string | null,
  phone: string | null,
) {
  const normalized = email?.trim().toLowerCase() || null;
  const key = `${candidate.candidateId}\n${normalized ?? ""}`;
  const existing = rows.get(key);
  if (!existing) {
    rows.set(key, {
      candidateId: candidate.candidateId,
      companyId: candidate.companyId,
      name: candidate.name,
      email: normalized,
      phoneDigits: phone,
      currentEmployer: candidate.currentEmployer,
      erased: candidate.erased,
    });
    return;
  }
  if (!existing.phoneDigits && phone) existing.phoneDigits = phone;
  if (candidate.erased) existing.erased = true;
}

export async function previewApplicantFile(input: {
  companyId: number;
  jobId: number;
  filename: string;
  bytes: Buffer;
  mapping: ImportMapping | null;
}) {
  const job = await prisma.job.findFirst({
    where: { id: input.jobId, companyId: input.companyId },
    select: { id: true },
  });
  if (!job) return { ok: false as const, error: "Requirement not found in your workspace." };

  const parsed = parseSpreadsheet({ filename: input.filename, bytes: input.bytes });
  if (!parsed.ok) return parsed;

  const emails = parsed.sheet.rows.map((row) => {
    const header = input.mapping?.email;
    const index = header ? parsed.sheet.headers.indexOf(header) : -1;
    const value = index >= 0 ? (row[index] ?? "") : "";
    const email = normalizeEmail(value);
    return typeof email === "string" ? email : "";
  });
  const names = parsed.sheet.rows.map((row) => {
    const header = input.mapping?.name;
    const index = header ? parsed.sheet.headers.indexOf(header) : -1;
    return index >= 0 ? (row[index] ?? "") : "";
  });
  const known = input.mapping
    ? await loadKnownCandidates(
        input.companyId,
        emails.filter(Boolean),
        names,
      )
    : [];
  const preview = input.mapping
    ? buildImportPreview({
        sheet: parsed.sheet,
        mapping: input.mapping,
        jobId: input.jobId,
        known,
        companyId: input.companyId,
      })
    : null;

  return {
    ok: true as const,
    headers: parsed.sheet.headers,
    sha256: parsed.sha256,
    preview,
  };
}

function sourceEnum(value: string): SourcingDatabaseSource | null {
  if (value === SourcingDatabaseSource.LINKEDIN || value === SourcingDatabaseSource.NAUKRI) return value;
  return null;
}

export async function confirmApplicantImport(input: {
  companyId: number;
  actorUserId: number;
  actorRole: string;
  jobId: number;
  filename: string;
  bytes: Buffer;
  mapping: ImportMapping;
  decisions: Record<string, ImportDecision>;
}) {
  const parsed = parseSpreadsheet({ filename: input.filename, bytes: input.bytes });
  if (!parsed.ok) return parsed;
  if (!input.mapping.name) return { ok: false as const, error: "Map a name column before importing." };

  const job = await prisma.job.findFirst({
    where: { id: input.jobId, companyId: input.companyId },
    select: { id: true, companyId: true, title: true },
  });
  if (!job) return { ok: false as const, error: "Requirement not found in your workspace." };
  const spec = await prisma.jobSpecificationVersion.findFirst({
    where: { jobId: job.id },
    orderBy: [{ status: "desc" }, { versionNumber: "desc" }],
    select: { id: true },
  });
  if (!spec) return { ok: false as const, error: "This requirement has no specification version." };

  const key = idempotencyKey({
    companyId: input.companyId,
    jobId: input.jobId,
    fileSha256: parsed.sha256,
    mapping: input.mapping,
    decisions: input.decisions,
  });

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`;
      const existing = await tx.applicantImportBatch.findUnique({
        where: { companyId_idempotencyKey: { companyId: input.companyId, idempotencyKey: key } },
        include: { rows: { orderBy: { rowNumber: "asc" } } },
      });
      if (existing?.status === ApplicantImportStatus.COMPLETED) {
        return { ok: true as const, batch: summarize(existing), repeated: true };
      }

      const batch =
        existing ??
        (await tx.applicantImportBatch.create({
          data: {
            companyId: input.companyId,
            jobId: input.jobId,
            createdByUserId: input.actorUserId,
            idempotencyKey: key,
            fileSha256: parsed.sha256,
            fileName: safeFileName(input.filename),
            status: ApplicantImportStatus.CONFIRMED,
            mapping: input.mapping as Prisma.InputJsonValue,
          },
          include: { rows: true },
        }));

      if (!existing) {
        await writeAuditLog(tx, {
          actorUserId: input.actorUserId,
          actorRole: input.actorRole,
          companyId: input.companyId,
          action: "IMPORT_CONFIRMED",
          targetType: "ApplicantImportBatch",
          targetId: batch.id,
          reason: `job ${input.jobId} file ${parsed.sha256.slice(0, 12)}`,
        });
      } else {
        await tx.applicantImportRow.deleteMany({
          where: { batchId: batch.id, companyId: input.companyId, code: "ROW_FAILED" },
        });
      }

      const emails: string[] = [];
      const names: string[] = [];
      const headerIndex = (field: keyof ImportMapping) => {
        const header = input.mapping[field];
        return header ? parsed.sheet.headers.indexOf(header) : -1;
      };
      const emailIndex = headerIndex("email");
      const nameIndex = headerIndex("name");
      for (const row of parsed.sheet.rows) {
        const email = emailIndex >= 0 ? normalizeEmail(row[emailIndex] ?? "") : null;
        if (typeof email === "string") emails.push(email);
        if (nameIndex >= 0) names.push(row[nameIndex] ?? "");
      }
      const known = await loadKnownCandidates(input.companyId, emails, names, tx);
      const preview = buildImportPreview({
        sheet: parsed.sheet,
        mapping: input.mapping,
        jobId: input.jobId,
        known,
        companyId: input.companyId,
      });
      const currentRows = await tx.applicantImportRow.findMany({
        where: { batchId: batch.id, companyId: input.companyId },
        select: { rowNumber: true },
      });
      const done = new Set(currentRows.map((row) => row.rowNumber));

      for (const row of preview.rows) {
        if (done.has(row.rowNumber)) continue;
        await writeRow(tx, {
          batchId: batch.id,
          companyId: input.companyId,
          jobId: job.id,
          jobTitle: job.title,
          specId: spec.id,
          row,
          sourceRow: parsed.sheet.rows[row.rowNumber - 2] ?? [],
          headers: parsed.sheet.headers,
          mapping: input.mapping,
          decision: input.decisions[String(row.rowNumber)],
        });
      }

      const rows = await tx.applicantImportRow.findMany({
        where: { batchId: batch.id, companyId: input.companyId },
      });
      const counts = {
        createdCount: rows.filter((row) => row.status === ApplicantImportRowStatus.CREATED).length,
        attachedCount: rows.filter((row) => row.status === ApplicantImportRowStatus.ATTACHED).length,
        skippedCount: rows.filter((row) => row.status === ApplicantImportRowStatus.SKIPPED).length,
        failedCount: rows.filter((row) => row.status === ApplicantImportRowStatus.FAILED).length,
      };
      const status =
        counts.failedCount > 0 && counts.createdCount + counts.attachedCount > 0
          ? ApplicantImportStatus.PARTIAL
          : counts.failedCount > 0 &&
              counts.createdCount + counts.attachedCount === 0 &&
              counts.skippedCount === 0
            ? ApplicantImportStatus.FAILED
            : ApplicantImportStatus.COMPLETED;
      const updated = await tx.applicantImportBatch.update({
        where: { id: batch.id },
        data: { ...counts, status, completedAt: new Date() },
        include: { rows: { orderBy: { rowNumber: "asc" } } },
      });
      await writeAuditLog(tx, {
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        companyId: input.companyId,
        action: status === ApplicantImportStatus.FAILED ? "IMPORT_FAILED" : "IMPORT_COMPLETED",
        targetType: "ApplicantImportBatch",
        targetId: batch.id,
        reason: `created ${counts.createdCount} attached ${counts.attachedCount} skipped ${counts.skippedCount} failed ${counts.failedCount}`,
      });
      return { ok: true as const, batch: summarize(updated), repeated: false };
    },
    { maxWait: 15_000, timeout: 60_000 },
  );
}

function summarize(batch: {
  id: number;
  status: ApplicantImportStatus;
  createdCount: number;
  attachedCount: number;
  skippedCount: number;
  failedCount: number;
  rows: Array<{
    rowNumber: number;
    status: ApplicantImportRowStatus;
    code: string;
    name: string;
    emailMasked: string | null;
    candidateId: number | null;
    applicationId: number | null;
  }>;
}) {
  return {
    id: batch.id,
    status: batch.status,
    createdCount: batch.createdCount,
    attachedCount: batch.attachedCount,
    skippedCount: batch.skippedCount,
    failedCount: batch.failedCount,
    rows: batch.rows.map((row) => ({
      rowNumber: row.rowNumber,
      status: row.status,
      code: row.code,
      name: row.name,
      emailMasked: row.emailMasked,
      candidateId: row.candidateId,
      applicationId: row.applicationId,
    })),
  };
}

async function writeRow(db: Prisma.TransactionClient, input: {
  batchId: number;
  companyId: number;
  jobId: number;
  jobTitle: string;
  specId: number;
  row: PreviewRow;
  sourceRow: string[];
  headers: string[];
  mapping: ImportMapping;
  decision: ImportDecision | undefined;
}) {
  const value = (field: keyof ImportMapping) => {
    const header = input.mapping[field];
    const index = header ? input.headers.indexOf(header) : -1;
    return index >= 0 ? (input.sourceRow[index] ?? "").trim() : "";
  };
  const emailValue = normalizeEmail(value("email"));
  const email = typeof emailValue === "string" ? emailValue : null;
  if (email) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`intake:${input.companyId}:${email}`})::bigint)`;
  }

  const allowedIds = new Set<number>();
  if (input.row.matchCandidateId) allowedIds.add(input.row.matchCandidateId);
  for (const suggestion of input.row.suggestions) allowedIds.add(suggestion.candidateId);
  if (typeof input.decision === "number" && !allowedIds.has(input.decision)) {
    await db.applicantImportRow.create({
      data: {
        batchId: input.batchId,
        companyId: input.companyId,
        rowNumber: input.row.rowNumber,
        status: ApplicantImportRowStatus.SKIPPED,
        code: "STALE_MATCH",
        name: input.row.name || "Unknown",
        emailMasked: input.row.emailMasked,
      },
    });
    return;
  }

  if (input.row.proposal === "skip" || input.row.errors.length > 0) {
    await db.applicantImportRow.create({
      data: {
        batchId: input.batchId,
        companyId: input.companyId,
        rowNumber: input.row.rowNumber,
        status: ApplicantImportRowStatus.SKIPPED,
        code: input.row.errors[0]?.slice(0, 180) || "SKIPPED",
        name: input.row.name || "Unknown",
        emailMasked: input.row.emailMasked,
      },
    });
    return;
  }

  let candidateId = input.row.matchCandidateId;
  if (input.row.proposal === "review") {
    if (typeof input.decision !== "number") {
      await db.applicantImportRow.create({
        data: {
          batchId: input.batchId,
          companyId: input.companyId,
          rowNumber: input.row.rowNumber,
          status: ApplicantImportRowStatus.SKIPPED,
          code: "NEEDS_CHOICE",
          name: input.row.name,
          emailMasked: input.row.emailMasked,
        },
      });
      return;
    }
    candidateId = input.decision;
  } else if (input.decision === "new") {
    candidateId = null;
  } else if (typeof input.decision === "number") {
    candidateId = input.decision;
  }

  if (candidateId != null) {
    const candidate = await db.candidate.findFirst({
      where: { id: candidateId, companyId: input.companyId, erasedAt: null },
      select: { id: true },
    });
    if (!candidate) {
      await db.applicantImportRow.create({
        data: {
          batchId: input.batchId,
          companyId: input.companyId,
          rowNumber: input.row.rowNumber,
          status: ApplicantImportRowStatus.SKIPPED,
          code: "STALE_MATCH",
          name: input.row.name,
          emailMasked: input.row.emailMasked,
        },
      });
      return;
    }
    candidateId = candidate.id;
  }

  try {
    let resolvedId = candidateId;
    let created = false;
    if (resolvedId == null) {
      const createdCandidate = await db.candidate.create({
        data: {
          name: input.row.name,
          role: value("currentTitle").slice(0, 120) || input.jobTitle,
          experienceYears: /^\d{1,2}$/.test(value("experience")) ? Number(value("experience")) : 0,
          currentEmployer: value("currentEmployer").slice(0, 200) || null,
          status: CandidateStatus.APPLIED,
          companyId: input.companyId,
        },
        select: { id: true },
      });
      resolvedId = createdCandidate.id;
      created = true;
    }

    const existingApplication = await db.application.findUnique({
      where: { candidateId_jobId: { candidateId: resolvedId, jobId: input.jobId } },
      select: { id: true },
    });
    const externalCandidateId = value("externalCandidateId").slice(0, 120) || null;
    if (existingApplication) {
      await db.applicantImportRow.create({
        data: {
          batchId: input.batchId,
          companyId: input.companyId,
          rowNumber: input.row.rowNumber,
          status: ApplicantImportRowStatus.SKIPPED,
          code: "ALREADY_APPLIED",
          name: input.row.name,
          emailMasked: input.row.emailMasked,
          candidateId: resolvedId,
          applicationId: existingApplication.id,
        },
      });
      return;
    }

    const application = await db.application.create({
      data: {
        candidateId: resolvedId,
        jobId: input.jobId,
        companyId: input.companyId,
        status: "CV_POOL",
        source: sourceEnum(value("source")),
      },
      select: { id: true },
    });
    await db.applicationIngestionEvent.create({
      data: {
        companyId: input.companyId,
        jobId: input.jobId,
        applicationId: application.id,
        candidateId: resolvedId,
        sourceChannel: "MANUAL",
        jobSpecificationVersionId: input.specId,
        status: "PROCESSED",
        applicantName: input.row.name,
        applicantEmailNormalized: email,
        applicantPhone: value("phone").slice(0, 40) || null,
        externalCandidateId,
        externalApplicationId: `import:${input.batchId}:${input.row.rowNumber}`,
      },
    });
    await db.applicantImportRow.create({
      data: {
        batchId: input.batchId,
        companyId: input.companyId,
        rowNumber: input.row.rowNumber,
        status: created ? ApplicantImportRowStatus.CREATED : ApplicantImportRowStatus.ATTACHED,
        code: created ? "CREATED" : "ATTACHED",
        name: input.row.name,
        emailMasked: input.row.emailMasked,
        candidateId: resolvedId,
        applicationId: application.id,
        externalCandidateId,
      },
    });
  } catch {
    await db.applicantImportRow.create({
      data: {
        batchId: input.batchId,
        companyId: input.companyId,
        rowNumber: input.row.rowNumber,
        status: ApplicantImportRowStatus.FAILED,
        code: "ROW_FAILED",
        name: input.row.name || "Unknown",
        emailMasked: input.row.emailMasked,
      },
    });
  }
}

export async function saveImportTemplate(input: {
  companyId: number;
  actorUserId: number;
  name: string;
  mapping: unknown;
}) {
  const mapping = mappingFromTemplate(input.mapping);
  const name = input.name.trim().slice(0, 80);
  if (!mapping || !mapping.name || !name) {
    return { ok: false as const, error: "A template needs a name and a name column." };
  }
  const row = await prisma.applicantImportTemplate.upsert({
    where: { companyId_name: { companyId: input.companyId, name } },
    create: {
      companyId: input.companyId,
      name,
      mapping,
      createdByUserId: input.actorUserId,
    },
    update: { mapping },
    select: { id: true, name: true, mapping: true },
  });
  return { ok: true as const, template: row };
}

export async function listImportTemplates(companyId: number) {
  return prisma.applicantImportTemplate.findMany({
    where: { companyId },
    select: { id: true, name: true, mapping: true },
    orderBy: { name: "asc" },
    take: 50,
  });
}

export async function getImportBatch(companyId: number, batchId: number) {
  return prisma.applicantImportBatch.findFirst({
    where: { id: batchId, companyId },
    select: {
      id: true,
      jobId: true,
      status: true,
      rows: {
        orderBy: { rowNumber: "asc" },
        select: {
          rowNumber: true,
          status: true,
          code: true,
          applicationId: true,
          candidateId: true,
        },
      },
    },
  });
}

export async function listImportBatches(companyId: number, jobId: number) {
  return prisma.applicantImportBatch.findMany({
    where: { companyId, jobId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      fileName: true,
      createdCount: true,
      attachedCount: true,
      skippedCount: true,
      failedCount: true,
      createdAt: true,
      rows: {
        orderBy: { rowNumber: "asc" },
        select: {
          rowNumber: true,
          status: true,
          code: true,
          name: true,
          emailMasked: true,
        },
      },
    },
  });
}
