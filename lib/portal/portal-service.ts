import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { stopQueuedAiEvaluation } from "@/lib/ai/opt-out";
import { generateSecureToken, hashSecureToken } from "@/lib/auth/secure-token";
import { sendOutboundEmail } from "@/lib/communication/email-transport";
import { prisma } from "@/lib/prisma";
import {
  documentRejection,
  linkExpired,
  maySendCandidateEmail,
  parseStatusLabel,
  PORTAL_LINK_TTL_MS,
  portalExport,
} from "@/lib/portal/candidate-portal";
import { buildResumeStorageKey, readResume, storeResume } from "@/lib/resumes/storage";
import { extractResumeText } from "@/lib/resumes/text-extraction";
import { cancelBookedInterview } from "@/lib/interviews/scheduling-service";

/**
 * Audit rows record the actor role (CANDIDATE), the tenant, the action, the target and the time. A candidate is not
 * a user, so actorUserId stays null: it must never name an administrator who did not act. The candidate is found
 * through the target id, and companyId comes from the application the validated portal session owns.
 * They never carry the candidate's email address or free text. Audit rows are append-only, so anything written
 * here cannot be erased later.
 */
const PORTAL_REASON = "via candidate portal";

async function audit(input: {
  companyId: number;
  action: string;
  targetType: string;
  targetId: number;
  reason: string;
}) {
  await writeAuditLog(prisma, {
    actorUserId: null,
    actorRole: "CANDIDATE",
    companyId: input.companyId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
  });
}

export async function applicationsForEmail(email: string) {
  const identities = await prisma.candidatePortalIdentity.findMany({
    where: { emailNormalized: email },
    select: { candidateId: true },
  });
  const events = await prisma.applicationIngestionEvent.findMany({
    where: { applicantEmailNormalized: email, applicationId: { not: null } },
    select: { applicationId: true },
  });
  const ids = new Set<number>();
  const candidateIds = identities.map((row) => row.candidateId);
  const fromCandidates = candidateIds.length
    ? await prisma.application.findMany({
        where: { candidateId: { in: candidateIds } },
        select: { id: true },
      })
    : [];
  for (const row of fromCandidates) ids.add(row.id);
  for (const row of events) if (row.applicationId) ids.add(row.applicationId);
  if (ids.size === 0) return [];
  return prisma.application.findMany({
    where: { id: { in: [...ids] } },
    orderBy: { id: "desc" },
    include: {
      job: { select: { title: true, company: { select: { name: true, applyNoticeText: true } } } },
      interviews: { orderBy: { interviewAt: "asc" } },
      outcomeEvents: { orderBy: { occurredAt: "asc" }, select: { occurredAt: true, toStatus: true } },
      portalDocuments: { where: { replacedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
}

export async function loadPortalApplication(email: string, applicationId: number) {
  const rows = await applicationsForEmail(email);
  return rows.find((row) => row.id === applicationId) ?? null;
}

export async function issuePortalLink(email: string, origin: string) {
  const known = await applicationsForEmail(email);
  if (known.length === 0) return null;
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + PORTAL_LINK_TTL_MS);
  await prisma.portalLoginLink.create({
    data: { emailNormalized: email, tokenHash: token.tokenHash, expiresAt },
  });
  return { rawToken: token.rawToken, expiresAt, url: `${origin}/portal/enter/${token.rawToken}` };
}

export async function createMagicLink(email: string, origin: string) {
  const link = await issuePortalLink(email, origin);
  if (!link) return null;
  if (maySendCandidateEmail({ unsubscribed: false, kind: "magic_link" })) {
    await sendOutboundEmail({
      to: email,
      subject: "Your HireIQ sign-in link",
      text: `Open this link to see your applications. It expires in 30 minutes.\n\n${link.url}`,
      html: `<p>Open this link to see your applications. It expires in 30 minutes.</p><p><a href="${link.url}">Sign in</a></p>`,
    });
  }
  return { rawToken: link.rawToken, expiresAt: link.expiresAt };
}

export async function consumeMagicLink(rawToken: string, now = new Date()) {
  const link = await prisma.portalLoginLink.findUnique({ where: { tokenHash: hashSecureToken(rawToken) } });
  if (!link || link.consumedAt || linkExpired(link.expiresAt, now)) return null;
  await prisma.portalLoginLink.update({ where: { id: link.id }, data: { consumedAt: now } });
  return { email: link.emailNormalized, expiresAt: link.expiresAt };
}

export async function setOptOut(applicationId: number, email: string, optedOut: boolean) {
  const application = await loadPortalApplication(email, applicationId);
  if (!application) return null;
  await prisma.application.update({
    where: { id: application.id },
    data: optedOut
      ? { aiEvaluationOptOut: true, aiOptOutAt: new Date() }
      : { aiEvaluationOptOut: false, aiOptOutAt: null },
  });
  if (optedOut) await stopQueuedAiEvaluation(application.id);
  await audit({
    companyId: application.companyId,
    action: optedOut ? "AI_OPT_OUT" : "AI_OPT_IN",
    targetType: "APPLICATION",
    targetId: application.id,
    reason: PORTAL_REASON,
  });
  return application.id;
}

export async function setFutureRolesConsent(applicationId: number, email: string, allowed: boolean) {
  const application = await loadPortalApplication(email, applicationId);
  if (!application) return null;
  await prisma.application.update({
    where: { id: application.id },
    data: { futureRolesConsent: allowed },
  });
  await audit({
    companyId: application.companyId,
    action: allowed ? "FUTURE_ROLES_CONSENT" : "FUTURE_ROLES_DECLINED",
    targetType: "APPLICATION",
    targetId: application.id,
    reason: PORTAL_REASON,
  });
  return application.id;
}

export async function requestPortalHumanReview(applicationId: number, email: string) {
  const application = await loadPortalApplication(email, applicationId);
  if (!application) return null;
  await prisma.application.update({
    where: { id: application.id },
    data: { humanReviewRequestedAt: new Date() },
  });
  await audit({
    companyId: application.companyId,
    action: "HUMAN_REVIEW_REQUESTED",
    targetType: "APPLICATION",
    targetId: application.id,
    reason: PORTAL_REASON,
  });
  return application.id;
}

export async function withdrawApplication(applicationId: number, email: string, reason: string) {
  const application = await loadPortalApplication(email, applicationId);
  if (!application || application.withdrawnAt) return null;
  await prisma.application.update({
    where: { id: application.id },
    data: { withdrawnAt: new Date(), withdrawReason: reason.trim().slice(0, 500) || null },
  });
  await audit({
    companyId: application.companyId,
    action: "APPLICATION_WITHDRAWN",
    targetType: "APPLICATION",
    targetId: application.id,
    reason: reason.trim() ? `${PORTAL_REASON} | reason given` : PORTAL_REASON,
  });
  return application.id;
}

export async function unsubscribeApplication(applicationId: number, email: string) {
  const application = await loadPortalApplication(email, applicationId);
  if (!application) return null;
  await prisma.application.update({
    where: { id: application.id },
    data: { emailUnsubscribedAt: new Date() },
  });
  await audit({
    companyId: application.companyId,
    action: "EMAIL_UNSUBSCRIBED",
    targetType: "APPLICATION",
    targetId: application.id,
    reason: PORTAL_REASON,
  });
  return application.id;
}

export async function queueDeletion(applicationId: number, email: string) {
  const application = await loadPortalApplication(email, applicationId);
  if (!application) return null;
  const row = await prisma.candidateDeletionRequest.create({
    data: {
      companyId: application.companyId,
      candidateId: application.candidateId,
      applicationId: application.id,
      emailNormalized: email,
      status: "QUEUED",
    },
  });
  await audit({
    companyId: application.companyId,
    action: "DELETION_REQUESTED",
    targetType: "CANDIDATE",
    targetId: application.candidateId,
    reason: PORTAL_REASON,
  });
  return row.id;
}

export async function exportPortalData(email: string) {
  const rows = await applicationsForEmail(email);
  const assessments = await prisma.generatedAssessmentInvite.findMany({
    where: { applicationId: { in: rows.map((row) => row.id) } },
    select: { applicationId: true, submittedAt: true, expiresAt: true },
  });
  return portalExport({
    email,
    applications: await Promise.all(rows.map(async (row) => ({
      id: row.id,
      job: row.job.title,
      company: row.job.company.name,
      stage: row.withdrawnAt ? "Withdrawn" : row.status,
      withdrawn: Boolean(row.withdrawnAt),
      interviews: row.interviews.map((interview) => ({
        at: interview.interviewAt.toISOString(),
        type: interview.type,
        meetUrl: interview.meetUrl,
      })),
      assessments: assessments
        .filter((item) => item.applicationId === row.id)
        .map((item) => ({
          submittedAt: item.submittedAt?.toISOString() ?? null,
          deadline: item.expiresAt.toISOString(),
        })),
      documents: row.portalDocuments.map((doc) => ({
        fileName: doc.fileName,
        kind: doc.kind,
        parseStatus: doc.parseStatus,
      })),
      files: await Promise.all(row.portalDocuments.map(async (doc) => ({
        fileName: doc.fileName,
        kind: doc.kind,
        contentBase64: (await readResume(doc.storageKey).catch(() => null))?.toString("base64") ?? null,
      }))),
    }))),
  });
}

export async function savePortalDocument(input: {
  email: string;
  applicationId: number;
  kind: "RESUME" | "COVER_LETTER" | "CERTIFICATE";
  fileName: string;
  contentType: string;
  bytes: Buffer;
}) {
  const application = await loadPortalApplication(input.email, input.applicationId);
  if (!application) return { error: "Application not found." };
  const rejected = documentRejection({ contentType: input.contentType, sizeBytes: input.bytes.byteLength });
  if (rejected) return { error: rejected };
  if (input.kind === "RESUME") {
    await prisma.candidatePortalDocument.updateMany({
      where: { applicationId: application.id, kind: "RESUME", replacedAt: null },
      data: { replacedAt: new Date() },
    });
  }
  const key = buildResumeStorageKey(application.companyId, application.candidateId, "pdf");
  await storeResume(key, input.bytes);
  let parseStatus = "STORED";
  let parseMessage = parseStatusLabel("STORED");
  if (input.kind === "RESUME") {
    const parsed = await extractResumeText(input.bytes, { fileName: input.fileName, contentType: input.contentType, ocr: "skip" });
    parseStatus = parsed.ok && parsed.text.trim() ? "PARSED" : "UNREADABLE";
    parseMessage = parseStatusLabel(parseStatus);
  }
  const doc = await prisma.candidatePortalDocument.create({
    data: {
      applicationId: application.id,
      companyId: application.companyId,
      candidateId: application.candidateId,
      kind: input.kind,
      fileName: input.fileName.slice(0, 180),
      contentType: input.contentType,
      sizeBytes: input.bytes.byteLength,
      storageKey: key,
      parseStatus,
      parseMessage,
    },
  });
  await audit({
    companyId: application.companyId,
    action: "DOCUMENT_UPLOADED",
    targetType: "APPLICATION",
    targetId: application.id,
    reason: `${PORTAL_REASON} | kind ${input.kind}`,
  });
  if (input.kind === "RESUME") {
    void import("@/lib/talent/rediscovery-service").then((mod) => mod.rerunRediscoveryForCandidate(application.candidateId).catch(() => undefined));
  }
  return { documentId: doc.id, parseMessage };
}

export async function issueAssessmentHandoff(email: string, applicationId: number, origin: string) {
  const application = await loadPortalApplication(email, applicationId);
  if (!application) return null;
  const invite = await prisma.generatedAssessmentInvite.findFirst({
    where: { applicationId: application.id, submittedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { id: "desc" },
  });
  if (!invite) return null;
  const token = generateSecureToken();
  await prisma.generatedAssessmentInvite.update({
    where: { id: invite.id },
    data: { handoffTokenHash: token.tokenHash },
  });
  return `${origin}/assess/${token.rawToken}`;
}

export async function issuePortalBookingLink(email: string, applicationId: number, origin: string) {
  const application = await loadPortalApplication(email, applicationId);
  if (!application) return null;
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
  await prisma.interviewBookingInvite.upsert({
    where: { applicationId: application.id },
    create: { applicationId: application.id, tokenHash: token.tokenHash, expiresAt },
    update: { tokenHash: token.tokenHash, expiresAt, usedAt: null },
  });
  await audit({
    companyId: application.companyId,
    action: "INTERVIEW_RESCHEDULE_LINK",
    targetType: "APPLICATION",
    targetId: application.id,
    reason: PORTAL_REASON,
  });
  return `${origin}/schedule/${token.rawToken}`;
}

export async function cancelPortalInterview(email: string, applicationId: number) {
  const application = await loadPortalApplication(email, applicationId);
  if (!application) return null;
  await cancelBookedInterview(application.id);
  await audit({
    companyId: application.companyId,
    action: "INTERVIEW_CANCELLED",
    targetType: "APPLICATION",
    targetId: application.id,
    reason: PORTAL_REASON,
  });
  return application.id;
}

export async function rememberPortalIdentity(email: string, candidateId: number, companyId: number) {
  await prisma.candidatePortalIdentity.upsert({
    where: { emailNormalized_candidateId: { emailNormalized: email, candidateId } },
    create: { emailNormalized: email, candidateId, companyId },
    update: {},
  });
}
