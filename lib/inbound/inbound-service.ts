import { CandidateStatus, InboundEmailStatus, type Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { generateSecureToken } from "@/lib/auth/secure-token";
import { encryptCredentialSecret, decryptCredentialSecret } from "@/lib/crypto/credential-encryption";
import { selectResumeAttachment } from "@/lib/inbound/attachment";
import { scanAttachment } from "@/lib/inbound/attachment-scan";
import {
  inboundEmailDomain,
  recipientTokenHash,
  type InboundEmailEvent,
} from "@/lib/inbound/contract";
import { decideIntakeMatch } from "@/lib/candidates/intake-match";
import { loadKnownCandidates } from "@/lib/imports/import-service";
import { maskEmail } from "@/lib/imports/import-mapping";
import { prisma } from "@/lib/prisma";
import { extractResumeText, type ExtractionOutcome } from "@/lib/resumes/text-extraction";
import { buildResumeStorageKey, readResume, storeResume } from "@/lib/resumes/storage";

type InboundParser = (bytes: Buffer, fileName: string) => Promise<ExtractionOutcome>;
let parserOverride: InboundParser | null = null;

/** Tests only. The override runs after content checks and the scan gate. */
export function setInboundResumeParserForTests(parser: InboundParser | null) {
  parserOverride = parser;
}

async function parseStoredResume(bytes: Buffer, fileName: string) {
  if (parserOverride) return parserOverride(bytes, fileName);
  return extractResumeText(bytes, { fileName });
}

export async function createInboundRoute(input: {
  companyId: number;
  jobId: number;
  actorUserId: number;
  actorRole: string;
}) {
  const job = await prisma.job.findFirst({
    where: { id: input.jobId, companyId: input.companyId, status: "OPEN" },
    select: { id: true },
  });
  if (!job) return { ok: false as const, error: "This job is not open for inbound email." };
  const domain = inboundEmailDomain();
  if (!domain) return { ok: false as const, error: "Inbound email is not configured." };
  const existing = await prisma.inboundEmailRoute.findUnique({
    where: { companyId_jobId: { companyId: input.companyId, jobId: input.jobId } },
  });
  if (existing) {
    return { ok: true as const, route: presentRoute(existing), created: false };
  }
  const token = generateSecureToken();
  let tokenCiphertext: string | null = null;
  try {
    tokenCiphertext = encryptCredentialSecret(token.rawToken);
  } catch {
    tokenCiphertext = null;
  }
  const route = await prisma.inboundEmailRoute.create({
    data: {
      companyId: input.companyId,
      jobId: input.jobId,
      tokenHash: token.tokenHash,
      tokenCiphertext,
      createdByUserId: input.actorUserId,
    },
  });
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    companyId: input.companyId,
    action: "INBOUND_ROUTE_CREATED",
    targetType: "InboundEmailRoute",
    targetId: route.id,
    reason: `job ${input.jobId}`,
  });
  return {
    ok: true as const,
    route: { ...presentRoute(route), address: `${token.rawToken}@${domain}` },
    created: true,
  };
}

function presentRoute(route: { id: number; enabled: boolean; tokenCiphertext: string | null; jobId: number }) {
  const domain = inboundEmailDomain();
  let address: string | null = null;
  if (route.tokenCiphertext && domain) {
    try {
      address = `${decryptCredentialSecret(route.tokenCiphertext)}@${domain}`;
    } catch {
      address = null;
    }
  }
  return { id: route.id, jobId: route.jobId, enabled: route.enabled, address, configured: Boolean(domain) };
}

export async function setInboundRouteEnabled(input: {
  companyId: number;
  jobId: number;
  enabled: boolean;
  actorUserId: number;
  actorRole: string;
}) {
  const route = await prisma.inboundEmailRoute.findFirst({
    where: { companyId: input.companyId, jobId: input.jobId },
  });
  if (!route) return { ok: false as const, error: "No inbound route for this job." };
  const updated = await prisma.inboundEmailRoute.update({
    where: { id: route.id },
    data: { enabled: input.enabled },
  });
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    companyId: input.companyId,
    action: input.enabled ? "INBOUND_ROUTE_ENABLED" : "INBOUND_ROUTE_DISABLED",
    targetType: "InboundEmailRoute",
    targetId: route.id,
    reason: `job ${input.jobId}`,
  });
  return { ok: true as const, route: presentRoute(updated) };
}

export async function getInboundRoute(companyId: number, jobId: number) {
  const route = await prisma.inboundEmailRoute.findFirst({ where: { companyId, jobId } });
  return route ? presentRoute(route) : null;
}

export async function listInboundMessages(companyId: number, jobId: number) {
  return prisma.inboundEmailMessage.findMany({
    where: { companyId, jobId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      code: true,
      applicantName: true,
      emailMasked: true,
      attachmentCount: true,
      applicationId: true,
      createdAt: true,
    },
  });
}

export async function getInboundMessage(companyId: number, messageId: number) {
  return prisma.inboundEmailMessage.findFirst({
    where: { id: messageId, companyId },
    select: { id: true, jobId: true, status: true, code: true, applicationId: true },
  });
}

export async function acceptInboundEvent(event: InboundEmailEvent) {
  const domain = inboundEmailDomain();
  const tokenHash = recipientTokenHash(event.recipient, domain);
  if (!tokenHash) return { ok: false as const, httpStatus: 404, code: "ROUTE_NOT_FOUND" };
  const route = await prisma.inboundEmailRoute.findUnique({
    where: { tokenHash },
    select: { id: true, companyId: true, jobId: true, enabled: true, createdByUserId: true, job: { select: { status: true } } },
  });
  if (!route) return { ok: false as const, httpStatus: 404, code: "ROUTE_NOT_FOUND" };
  if (!route.enabled) return reject(route, event.eventId, "ROUTE_DISABLED");
  if (route.job.status !== "OPEN") return reject(route, event.eventId, "JOB_NOT_OPEN");

  const prior = await prisma.inboundEmailMessage.findUnique({ where: { providerEventId: event.eventId } });
  if (prior) {
    if (prior.companyId !== route.companyId) return { ok: false as const, httpStatus: 404, code: "ROUTE_NOT_FOUND" };
    if (prior.status !== InboundEmailStatus.FAILED || prior.applicationId) {
      return { ok: true as const, httpStatus: 200, message: publicMessage(prior), duplicate: true };
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${event.eventId})::bigint)`;
    const again = await tx.inboundEmailMessage.findUnique({ where: { providerEventId: event.eventId } });
    if (again && (again.status !== InboundEmailStatus.FAILED || again.applicationId)) {
      return { ok: true as const, httpStatus: 200, message: publicMessage(again), duplicate: true };
    }
    const current = again ?? await tx.inboundEmailMessage.create({
      data: {
        companyId: route.companyId,
        jobId: route.jobId,
        routeId: route.id,
        providerEventId: event.eventId,
        status: InboundEmailStatus.RECEIVED,
        attachmentCount: event.attachments.length,
        applicantName: event.applicantName,
        emailMasked: event.applicantEmail ? maskEmail(event.applicantEmail) : null,
        applicantEmailNormalized: event.applicantEmail,
      },
    });
    const outcome = await processMessage(tx, current.id, route, event);
    return { ok: true as const, httpStatus: 202, message: outcome, duplicate: Boolean(again) };
  }, { maxWait: 15_000, timeout: 60_000 });
}

async function reject(
  route: { id: number; companyId: number; jobId: number; createdByUserId: number },
  eventId: string,
  code: string,
) {
  const existing = await prisma.inboundEmailMessage.findUnique({ where: { providerEventId: eventId } });
  if (existing) return { ok: true as const, httpStatus: 200, message: publicMessage(existing), duplicate: true };
  const message = await prisma.inboundEmailMessage.create({
    data: {
      companyId: route.companyId,
      jobId: route.jobId,
      routeId: route.id,
      providerEventId: eventId,
      status: InboundEmailStatus.REJECTED,
      code,
    },
  });
  await writeAuditLog(prisma, {
    actorUserId: route.createdByUserId,
    actorRole: "ADMIN",
    companyId: route.companyId,
    action: "INBOUND_EMAIL_REJECTED",
    targetType: "InboundEmailMessage",
    targetId: message.id,
    reason: `job ${route.jobId} ${code}`,
  });
  return { ok: false as const, httpStatus: 409, code };
}

function publicMessage(message: { id: number; status: InboundEmailStatus; code: string | null; applicationId: number | null }) {
  return { id: message.id, status: message.status, code: message.code, applicationId: message.applicationId };
}

async function processMessage(
  db: Prisma.TransactionClient,
  messageId: number,
  route: { companyId: number; jobId: number; createdByUserId: number },
  event: InboundEmailEvent,
) {
  const companyId = route.companyId;
  const jobId = route.jobId;
  const decoded = event.attachments.map((attachment) => ({
    fileName: attachment.fileName,
    bytes: decodeBase64(attachment.contentBase64),
  }));
  if (decoded.some((item) => item.bytes == null)) {
    return finish(db, messageId, route, InboundEmailStatus.REJECTED, "MALFORMED_ATTACHMENT", null, null);
  }
  const selected = selectResumeAttachment(decoded.map((item) => ({ fileName: item.fileName, bytes: item.bytes! })));
  if (!selected.chosen && selected.code && selected.code !== "EXTRA_ATTACHMENTS") {
    const status = selected.code === "ATTACHMENT_TOO_LARGE" || selected.code === "TOO_MANY_ATTACHMENTS"
      ? InboundEmailStatus.REJECTED
      : InboundEmailStatus.REVIEW;
    return finish(db, messageId, route, status, selected.code, null, null);
  }
  if (selected.chosen) {
    const scan = await scanAttachment(selected.chosen.bytes);
    if (scan.status === "infected") {
      return finish(db, messageId, route, InboundEmailStatus.REJECTED, "MALWARE_REJECTED", null, null);
    }
    try {
      const stored = await storeResume(
        buildResumeStorageKey(companyId, jobId, selected.chosen.extension),
        selected.chosen.bytes,
      );
      await db.inboundEmailMessage.update({
        where: { id: messageId },
        data: { storageKey: stored.storageKey, malwareScan: scan.status },
      });
    } catch {
      return finish(db, messageId, route, InboundEmailStatus.FAILED, "STORAGE_FAILED", null, null);
    }
    const parsed = await parseStoredResume(selected.chosen.bytes, selected.chosen.fileName);
    if (!parsed.ok) {
      return finish(db, messageId, route, InboundEmailStatus.FAILED, parsed.errorCode, null, null);
    }
  }
  if (!event.applicantName) {
    return finish(db, messageId, route, InboundEmailStatus.REVIEW, "INCOMPLETE", null, null);
  }
  return createApplicationFromInbound(db, {
    messageId,
    companyId,
    jobId,
    createdByUserId: route.createdByUserId,
    applicantName: event.applicantName,
    applicantEmail: event.applicantEmail,
  });
}

async function createApplicationFromInbound(
  db: Prisma.TransactionClient,
  input: {
    messageId: number;
    companyId: number;
    jobId: number;
    createdByUserId: number;
    applicantName: string;
    applicantEmail: string | null;
  },
) {
  if (input.applicantEmail) {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`intake:${input.companyId}:${input.applicantEmail}`})::bigint)`;
  }
  const known = await loadKnownCandidates(
    input.companyId,
    input.applicantEmail ? [input.applicantEmail] : [],
    [input.applicantName],
    db,
  );
  const decision = decideIntakeMatch({
    companyId: input.companyId,
    email: input.applicantEmail,
    phoneDigits: null,
    name: input.applicantName,
    employer: null,
    known,
  });
  const route = {
    companyId: input.companyId,
    jobId: input.jobId,
    createdByUserId: input.createdByUserId,
  };
  if (decision.decision === "review") {
    return finish(db, input.messageId, route, InboundEmailStatus.REVIEW, "AMBIGUOUS_MATCH", null, null);
  }
  if (decision.decision === "erased") {
    return finish(db, input.messageId, route, InboundEmailStatus.REJECTED, "CANDIDATE_ERASED", null, null);
  }
  const spec = await db.jobSpecificationVersion.findFirst({
    where: { jobId: input.jobId },
    orderBy: [{ status: "desc" }, { versionNumber: "desc" }],
    select: { id: true },
  });
  if (!spec) return finish(db, input.messageId, route, InboundEmailStatus.FAILED, "SPEC_MISSING", null, null);
  const job = await db.job.findFirst({
    where: { id: input.jobId, companyId: input.companyId },
    select: { title: true },
  });
  let candidateId = decision.decision === "attach" ? decision.candidateId : null;
  let created = false;
  if (candidateId == null) {
    const candidate = await db.candidate.create({
      data: {
        name: input.applicantName,
        role: job?.title ?? "Applicant",
        experienceYears: 0,
        status: CandidateStatus.APPLIED,
        companyId: input.companyId,
      },
      select: { id: true },
    });
    candidateId = candidate.id;
    created = true;
  }
  const existingApplication = await db.application.findUnique({
    where: { candidateId_jobId: { candidateId, jobId: input.jobId } },
    select: { id: true },
  });
  const applicationId = existingApplication
    ? existingApplication.id
    : (
        await db.application.create({
          data: {
            candidateId,
            jobId: input.jobId,
            companyId: input.companyId,
            status: "CV_POOL",
          },
          select: { id: true },
        })
      ).id;
  if (!existingApplication) {
    await db.applicationIngestionEvent.create({
      data: {
        companyId: input.companyId,
        jobId: input.jobId,
        applicationId,
        candidateId,
        sourceChannel: "MANUAL",
        jobSpecificationVersionId: spec.id,
        status: "PROCESSED",
        applicantName: input.applicantName,
        applicantEmailNormalized: input.applicantEmail,
        externalApplicationId: `inbound:${input.messageId}`,
      },
    });
  }
  return finish(
    db,
    input.messageId,
    route,
    InboundEmailStatus.PROCESSED,
    created ? "CREATED" : existingApplication ? "ALREADY_APPLIED" : "ATTACHED",
    applicationId,
    candidateId,
  );
}

async function finish(
  db: Prisma.TransactionClient,
  messageId: number,
  route: { companyId: number; jobId: number; createdByUserId: number },
  status: InboundEmailStatus,
  code: string,
  applicationId: number | null,
  candidateId: number | null,
) {
  const message = await db.inboundEmailMessage.update({
    where: { id: messageId },
    data: {
      status,
      code,
      ...(applicationId != null ? { applicationId, candidateId } : {}),
    },
  });
  const action =
    status === InboundEmailStatus.PROCESSED
      ? "INBOUND_EMAIL_COMPLETED"
      : status === InboundEmailStatus.REVIEW
        ? "INBOUND_EMAIL_REVIEW"
        : status === InboundEmailStatus.FAILED
          ? "INBOUND_EMAIL_FAILED"
          : "INBOUND_EMAIL_REJECTED";
  await writeAuditLog(db, {
    actorUserId: route.createdByUserId,
    actorRole: "ADMIN",
    companyId: route.companyId,
    action,
    targetType: "InboundEmailMessage",
    targetId: messageId,
    reason: `job ${route.jobId} ${code}`,
  });
  return publicMessage(message);
}

function decodeBase64(value: string): Buffer | null {
  const compact = value.replace(/\s/g, "");
  if (!compact || compact.length > INBOUND_ATTACHMENT_BASE64_MAX) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  const bytes = Buffer.from(compact, "base64");
  return bytes.length > 0 ? bytes : null;
}

const INBOUND_ATTACHMENT_BASE64_MAX = Math.ceil(2 * 1024 * 1024 / 3) * 4 + 16;

export async function retryInboundEmailMessage(companyId: number, messageId: number) {
  const message = await prisma.inboundEmailMessage.findFirst({
    where: { id: messageId, companyId },
    select: {
      id: true,
      applicationId: true,
      code: true,
      jobId: true,
      status: true,
      storageKey: true,
      applicantName: true,
      applicantEmailNormalized: true,
      route: { select: { createdByUserId: true, companyId: true, jobId: true } },
    },
  });
  if (!message || message.route.companyId !== companyId) return { ok: false as const, error: "Message not found." };
  if (message.applicationId && message.status === InboundEmailStatus.PROCESSED) {
    return { ok: true as const, message: publicMessage(message) };
  }
  if (message.applicationId) {
    const updated = await prisma.inboundEmailMessage.update({
      where: { id: message.id },
      data: { status: InboundEmailStatus.PROCESSED, code: "RECOVERED" },
    });
    return { ok: true as const, message: publicMessage(updated) };
  }
  if (message.status !== InboundEmailStatus.FAILED || !message.storageKey) {
    return { ok: false as const, error: "This failure is not retryable." };
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${messageId})`;
    const current = await tx.inboundEmailMessage.findFirst({
      where: { id: messageId, companyId },
    });
    if (!current) return { ok: false as const, error: "Message not found." };
    if (current.applicationId) {
      const updated = await tx.inboundEmailMessage.update({
        where: { id: current.id },
        data: { status: InboundEmailStatus.PROCESSED, code: current.status === InboundEmailStatus.PROCESSED ? current.code : "RECOVERED" },
      });
      return { ok: true as const, message: publicMessage(updated) };
    }
    if (!current.storageKey) {
      return { ok: false as const, error: "This failure is not retryable." };
    }
    const bytes = await readResume(current.storageKey);
    if (!bytes) {
      const missing = await tx.inboundEmailMessage.update({
        where: { id: current.id },
        data: { status: InboundEmailStatus.FAILED, code: "MISSING_ATTACHMENT" },
      });
      return { ok: false as const, error: "MISSING_ATTACHMENT", message: publicMessage(missing) };
    }
    const extension = current.storageKey.slice(current.storageKey.lastIndexOf(".") + 1);
    const parsed = await parseStoredResume(bytes, `resume.${extension}`);
    if (!parsed.ok) {
      const failed = await tx.inboundEmailMessage.update({
        where: { id: current.id },
        data: { status: InboundEmailStatus.FAILED, code: parsed.errorCode },
      });
      return { ok: false as const, error: parsed.errorCode, message: publicMessage(failed) };
    }
    if (!current.applicantName) {
      const incomplete = await tx.inboundEmailMessage.update({
        where: { id: current.id },
        data: { status: InboundEmailStatus.REVIEW, code: "INCOMPLETE" },
      });
      return { ok: true as const, message: publicMessage(incomplete) };
    }
    const outcome = await createApplicationFromInbound(tx, {
      messageId: current.id,
      companyId,
      jobId: current.jobId,
      createdByUserId: message.route.createdByUserId,
      applicantName: current.applicantName,
      applicantEmail: current.applicantEmailNormalized,
    });
    return { ok: true as const, message: outcome };
  }, { maxWait: 15_000, timeout: 60_000 });
}

export async function retryDueInboundMessages() {
  const due = await prisma.inboundEmailMessage.findMany({
    where: { status: InboundEmailStatus.FAILED, applicationId: { not: null } },
    take: 20,
    select: { id: true, companyId: true },
  });
  let recovered = 0;
  for (const row of due) {
    const result = await retryInboundEmailMessage(row.companyId, row.id);
    if (result.ok) recovered += 1;
  }
  return { considered: due.length, recovered };
}
