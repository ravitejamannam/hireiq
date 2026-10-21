import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { deleteResumeObject } from "@/lib/resumes/storage";
import type { StorageDeleteResult } from "@/lib/resumes/storage-types";

/**
 * Erases one candidate's personal data inside one tenant. Idempotent and resumable.
 *
 * Each step is independent and can be repeated. A failed step is recorded by name on the
 * CandidateErasure ledger (names only, never content) and the run ends PARTIAL, so the retry pass
 * picks it up. The Candidate.erasedAt tombstone is written first, so pending parse, OCR, grading,
 * intelligence, embedding and email work refuses to write new personal data while the rest runs.
 *
 * Treatment (see docs/privacy/data-lifecycle-inventory.md):
 *   DELETE    object-storage files, embeddings, assistant chat, notetaker quotes, portal identity rows
 *   REDACT    free text, quotes, answers, grades' quotes, rationales, queued-email content, AI outputs,
 *             linked inbound messages, linked import rows, and decision rationales
 *   ANONYMISE identity fields on candidate, submission, ingestion event, deletion request
 *   KEEP      ids, statuses, timestamps, scores, content hashes, audit rows (no personal content by design)
 */

export type ErasureTrigger = "ADMIN_REQUEST" | "DELETION_QUEUE" | "RETENTION_POLICY";

export type ErasureDeps = {
  /** Object-storage delete. FAILED (or a throw) marks the step failed and retryable. It is never counted as deleted. */
  deleteObject: (key: string) => Promise<StorageDeleteResult>;
};

const defaultDeps: ErasureDeps = { deleteObject: (key) => deleteResumeObject(key) };

export type StorageCounts = { deleted: number; absent: number; failed: number };

export type ErasureResult = {
  candidateId: number;
  companyId: number;
  status: "COMPLETED" | "PARTIAL";
  completedSteps: string[];
  failedSteps: string[];
  attempts: number;
  /** Object-storage outcomes in this run. `absent` objects were already gone. `failed` objects need the retry. */
  storage: StorageCounts;
  /** Queue rows with no tenant tag, handled by the conservative legacy policy. See `queued-email`. */
  legacyEmail: { sanitized: number; cancelledOnly: number; leftAmbiguous: number };
};

export class CandidateErasureError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const ERASED_EMAIL = "erased@erased.invalid";
const GONE = new Date("1970-01-01T00:00:00.000Z");

type Ctx = {
  companyId: number;
  candidateId: number;
  deps: ErasureDeps;
  applicationIds: number[];
  evidenceIds: number[];
  submissionIds: number[];
  emails: string[];
  storage: StorageCounts;
  legacyEmail: { sanitized: number; cancelledOnly: number; leftAmbiguous: number };
};

/** `requires`: steps that must have completed first. A step that destroys data another step needs waits for it. */
type Step = { name: string; requires?: string[]; run: (ctx: Ctx) => Promise<void> };

async function deleteObjects(ctx: Ctx, keys: Array<string | null | undefined>) {
  for (const key of keys) {
    if (!key) continue;
    let result: StorageDeleteResult;
    try {
      result = await ctx.deps.deleteObject(key);
    } catch {
      result = { status: "FAILED", code: "STORAGE_DELETE_FAILED" };
    }
    if (result?.status === "DELETED") ctx.storage.deleted += 1;
    else if (result?.status === "ABSENT") ctx.storage.absent += 1;
    else ctx.storage.failed += 1;
  }
  if (ctx.storage.failed > 0) throw new Error("OBJECT_DELETE_FAILED");
}

/** Company plus candidate id, or an application id loaded for that same pair. Never name or email. */
function linkedByCandidateOrApplication(ctx: Ctx) {
  const or: Array<{ candidateId: number } | { applicationId: { in: number[] } }> = [{ candidateId: ctx.candidateId }];
  if (ctx.applicationIds.length > 0) or.push({ applicationId: { in: ctx.applicationIds } });
  return { companyId: ctx.companyId, OR: or };
}

const STEPS: Step[] = [
  {
    // First, because the other steps remove the addresses this step uses to find untagged mail.
    name: "queued-email",
    run: async (ctx) => {
      const { companyId, candidateId } = ctx;
      // 1. Tagged rows: this tenant and this candidate. Content removed, never retried.
      await prisma.outboundEmailAttempt.updateMany({
        where: { companyId, candidateId },
        data: { to: ERASED_EMAIL, subject: "erased", text: "", html: "", lastError: null },
      });
      // A delivered message keeps its SENT status as a true record. Anything else is cancelled and never retried.
      await prisma.outboundEmailAttempt.updateMany({
        where: { companyId, candidateId, status: { not: "SENT" } },
        data: { status: "CANCELLED", nextRetryAt: new Date("2099-01-01T00:00:00.000Z") },
      });
      // 2. Untagged (legacy) rows. An address match alone does not prove the row is about this candidate in this
      //    tenant, so the policy is conservative:
      //    - Address belongs to no other live candidate or portal identity anywhere: the recipient can only be this
      //      person, so content is removed and the row cancelled.
      //    - Address is also used by someone else: stop any unsent row from being sent (cancel, content untouched)
      //      and leave the content. It is counted as ambiguous for a person to review.
      for (const email of ctx.emails) {
        const shared = await addressUsedByAnotherPerson(email, candidateId);
        if (!shared) {
          await prisma.outboundEmailAttempt.updateMany({
            where: { companyId: null, to: email, status: { not: "SENT" } },
            data: { status: "CANCELLED", nextRetryAt: new Date("2099-01-01T00:00:00.000Z") },
          });
          const cleaned = await prisma.outboundEmailAttempt.updateMany({
            where: { companyId: null, to: email },
            data: { to: ERASED_EMAIL, subject: "erased", text: "", html: "", lastError: null },
          });
          ctx.legacyEmail.sanitized += cleaned.count;
          await prisma.portalLoginLink.deleteMany({ where: { emailNormalized: email } });
        } else {
          const stopped = await prisma.outboundEmailAttempt.updateMany({
            where: { companyId: null, to: email, status: { in: ["PENDING", "FAILED"] } },
            data: { status: "CANCELLED", nextRetryAt: new Date("2099-01-01T00:00:00.000Z"), lastError: "Cancelled: recipient address is under an erasure request" },
          });
          ctx.legacyEmail.cancelledOnly += stopped.count;
          ctx.legacyEmail.leftAmbiguous += await prisma.outboundEmailAttempt.count({ where: { companyId: null, to: email } });
        }
      }
    },
  },
  {
    name: "identity",
    requires: ["queued-email"],
    run: async (ctx) => {
      const { companyId, candidateId } = ctx;
      await prisma.candidate.update({
        where: { id: candidateId },
        data: {
          name: `Erased Candidate #${candidateId}`,
          currentEmployer: null,
          skills: null,
          location: null,
          expectedCTC: null,
        },
      });
      // Free-text decisions can name the person. Codes, statuses and dates stay.
      await prisma.application.updateMany({
        where: { candidateId, companyId },
        data: {
          rejectionReason: null,
          withdrawReason: null,
          statusTokenHash: null,
          emailUnsubscribedAt: new Date(),
          whatsAppOptInAt: null,
          aiPreference: "REFUSED",
          aiPreferenceSource: "ERASED",
          aiPreferenceAt: new Date(),
        },
      });
      await prisma.spotCheck.updateMany({ where: { companyId, applicationId: { in: ctx.applicationIds } }, data: { note: null } });
      await prisma.candidateIdentitySignal.updateMany({ where: { candidateId }, data: { normalizedValue: "ERASED" } });
      await prisma.candidatePortalIdentity.deleteMany({ where: { candidateId, companyId } });
      const { deleteSelfIdentification } = await import("@/lib/fairness/self-id");
      await deleteSelfIdentification(candidateId);
    },
  },
  {
    name: "profile",
    run: async (ctx) => {
      const photos = await prisma.candidateProfile.findMany({ where: { candidateId: ctx.candidateId }, select: { photoStorageKey: true } });
      // Content first, object second, and the key is cleared last so a failed delete can be retried.
      await prisma.candidateProfile.updateMany({
        where: { candidateId: ctx.candidateId },
        data: {
          headline: null,
          skillsText: null,
          currentEmployer: null,
          expectedCTC: null,
          linkedInUrl: null,
          location: null,
          aboutText: null,
          roleTitle: null,
          domains: Prisma.JsonNull,
          githubUrl: null,
          portfolioUrl: null,
          twitterUrl: null,
          videoResumeUrl: null,
          leetcodeUrl: null,
          socialLinks: Prisma.JsonNull,
          experiences: Prisma.JsonNull,
          education: Prisma.JsonNull,
          projects: Prisma.JsonNull,
        },
      });
      await deleteObjects(ctx, photos.map((row) => row.photoStorageKey));
      await prisma.candidateProfile.updateMany({ where: { candidateId: ctx.candidateId }, data: { photoStorageKey: null, photoContentType: null } });
    },
  },
  {
    name: "hosted-submissions",
    requires: ["queued-email"],
    run: async (ctx) => {
      const { companyId, candidateId, submissionIds } = ctx;
      await prisma.applicationIngestionEvent.updateMany({
        where: { candidateId, companyId },
        data: {
          applicantName: "ERASED",
          applicantEmailNormalized: null,
          applicantPhone: null,
          applicantLocation: null,
          applicantLinkedInUrl: null,
          errorMessage: null,
        },
      });
      if (submissionIds.length === 0) return;
      await prisma.hostedApplySubmission.updateMany({
        where: { id: { in: submissionIds }, companyId },
        data: {
          name: "ERASED",
          emailNormalized: `erased-${candidateId}@erased.invalid`,
          phone: null,
          location: null,
          linkedInUrl: null,
          coverLetter: null,
          profilePayload: Prisma.JsonNull,
        },
      });
      const uploads = await prisma.hostedApplyResumeUpload.findMany({
        where: { hostedApplySubmissionId: { in: submissionIds }, companyId },
        select: { storageKey: true },
      });
      const photos = await prisma.hostedApplyPhotoUpload.findMany({
        where: { hostedApplySubmissionId: { in: submissionIds }, companyId },
        select: { storageKey: true },
      });
      await prisma.hostedApplyResumeUpload.updateMany({
        where: { hostedApplySubmissionId: { in: submissionIds }, companyId },
        data: { extractedText: null, fieldSuggestion: Prisma.JsonNull, fileName: "erased", parseStatus: "FAILED", parseErrorCode: "ERASED", ocrClaimedAt: null },
      });
      await deleteObjects(ctx, [...uploads.map((row) => row.storageKey), ...photos.map((row) => row.storageKey)]);
    },
  },
  {
    name: "resume-documents",
    run: async (ctx) => {
      const { companyId, candidateId } = ctx;
      const docs = await prisma.candidateResumeDocument.findMany({ where: { candidateId, companyId }, select: { storageKey: true } });
      const portal = await prisma.candidatePortalDocument.findMany({ where: { candidateId, companyId }, select: { storageKey: true } });
      // parseStatus FAILED + parseErrorCode ERASED removes the row from the OCR queue and makes a late parse result a no-op.
      await prisma.candidateResumeDocument.updateMany({
        where: { candidateId, companyId },
        data: { extractedText: null, fieldSuggestion: Prisma.JsonNull, fileName: "erased", parseStatus: "FAILED", parseErrorCode: "ERASED", ocrClaimedAt: null },
      });
      await prisma.candidatePortalDocument.updateMany({
        where: { candidateId, companyId },
        data: { fileName: "erased", replacedAt: new Date(), parseMessage: "Erased" },
      });
      await deleteObjects(ctx, [...docs.map((row) => row.storageKey), ...portal.map((row) => row.storageKey)]);
    },
  },
  {
    name: "evidence-and-claims",
    run: async (ctx) => {
      const { companyId, candidateId } = ctx;
      await prisma.candidateEvidence.updateMany({ where: { candidateId, companyId }, data: { inlineText: null } });
      await prisma.candidateClaim.updateMany({
        where: { candidateId, companyId, claimType: { not: "SKILL" } },
        data: { value: "ERASED", normalizedValue: "ERASED" },
      });
      // Skill claims are kept: a skill name is not about the person. Policy decision recorded in the inventory.
      await prisma.requirementAssessment.updateMany({
        where: { candidateId, companyId },
        data: { citationQuote: null, overrideReason: null },
      });
    },
  },
  {
    name: "embeddings",
    run: async (ctx) => {
      if (ctx.evidenceIds.length === 0) return;
      await prisma.retrievalEmbedding.deleteMany({
        where: { companyId: ctx.companyId, sourceType: "EVIDENCE", sourceId: { in: ctx.evidenceIds } },
      });
    },
  },
  {
    // Retrieval snapshots name the candidate by id. Matched terms and the supporting-evidence link come from the
    // candidate's text, so they are cleared. Rank and score rows stay: removing them would change other candidates'
    // ranks in the same run. Hybrid rows hold only ids, ranks and scores.
    name: "retrieval-snapshots",
    run: async (ctx) => {
      const { companyId, candidateId } = ctx;
      await prisma.lexicalRetrievalResult.updateMany({ where: { companyId, candidateId }, data: { matchedTerms: [] } });
      await prisma.semanticRetrievalResult.updateMany({ where: { companyId, candidateId }, data: { supportingEvidenceId: null } });
    },
  },
  {
    name: "ai-outputs",
    run: async (ctx) => {
      const { companyId, candidateId } = ctx;
      const invites = await prisma.generatedAssessmentInvite.findMany({ where: { applicationId: { in: ctx.applicationIds } }, select: { id: true } });
      const practical = await prisma.codingTest.findMany({ where: { applicationId: { in: ctx.applicationIds } }, select: { id: true } });
      const uploads = ctx.submissionIds.length
        ? await prisma.hostedApplyResumeUpload.findMany({ where: { hostedApplySubmissionId: { in: ctx.submissionIds }, companyId }, select: { id: true } })
        : [];
      const documents = await prisma.candidateResumeDocument.findMany({ where: { candidateId, companyId }, select: { id: true } });
      const targets: Array<{ entityType: string; ids: number[] }> = [
        { entityType: "CandidateResumeDocument", ids: documents.map((row) => row.id) },
        { entityType: "CandidateEvidence", ids: ctx.evidenceIds },
        { entityType: "GeneratedAssessmentInvite", ids: invites.map((row) => row.id) },
        { entityType: "CodingTest", ids: practical.map((row) => row.id) },
        { entityType: "HostedApplyResumeUpload", ids: uploads.map((row) => row.id) },
        { entityType: "Application", ids: ctx.applicationIds },
        { entityType: "Candidate", ids: [candidateId] },
      ];
      for (const target of targets) {
        if (target.ids.length === 0) continue;
        // Keeps feature, model, prompt version, token counts and input hash. Drops the output, which can quote the candidate.
        await prisma.aIRun.updateMany({
          where: { companyId, entityType: target.entityType, entityId: { in: target.ids } },
          data: { outputJson: {}, error: null, reviewerReason: null },
        });
      }
    },
  },
  {
    name: "assessments",
    run: async (ctx) => {
      const { companyId } = ctx;
      const invites = await prisma.generatedAssessmentInvite.findMany({
        where: { applicationId: { in: ctx.applicationIds } },
        select: { id: true, grades: true },
      });
      for (const invite of invites) {
        const grades = Array.isArray(invite.grades)
          ? (invite.grades as Array<Record<string, unknown>>).map((entry) => ({ ...entry, quote: null, overrideReason: null }))
          : null;
        await prisma.generatedAssessmentInvite.update({
          where: { id: invite.id },
          data: {
            answers: {},
            integrity: Prisma.JsonNull,
            grades: grades === null ? Prisma.JsonNull : (grades as unknown as Prisma.InputJsonValue),
            tokenHash: `erased:${invite.id}`,
            handoffTokenHash: null,
            expiresAt: GONE,
          },
        });
      }
      const legacy = await prisma.assessmentInvite.findMany({ where: { applicationId: { in: ctx.applicationIds } }, select: { id: true } });
      if (legacy.length > 0) {
        const inviteIds = legacy.map((row) => row.id);
        await prisma.assessmentAiExchange.deleteMany({ where: { companyId, inviteId: { in: inviteIds } } });
        await prisma.assessmentAttempt.updateMany({ where: { inviteId: { in: inviteIds } }, data: { integritySignals: Prisma.JsonNull } });
        await prisma.assessmentInvite.updateMany({ where: { id: { in: inviteIds }, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    },
  },
  {
    name: "practical",
    run: async (ctx) => {
      const tests = await prisma.codingTest.findMany({ where: { applicationId: { in: ctx.applicationIds } }, select: { id: true } });
      if (tests.length === 0) return;
      const ids = tests.map((row) => row.id);
      await prisma.codingTest.updateMany({ where: { id: { in: ids } }, data: { submissionText: null, submissionUrl: null, inviteTokenHash: null } });
      await prisma.practicalCriterionScore.updateMany({
        where: { companyId: ctx.companyId, codingTestId: { in: ids } },
        data: { rationale: null, evidenceQuote: null },
      });
    },
  },
  {
    name: "interviews-and-scheduling",
    run: async (ctx) => {
      const { companyId } = ctx;
      const interviews = await prisma.interview.findMany({ where: { applicationId: { in: ctx.applicationIds } }, select: { id: true } });
      const interviewIds = interviews.map((row) => row.id);
      if (interviewIds.length > 0) {
        // Unsent reminders would email the person. Sent ones are history and stay.
        await prisma.interviewReminder.deleteMany({ where: { interviewId: { in: interviewIds }, sentAt: null } });
        await prisma.notetakerNote.deleteMany({ where: { companyId, interviewId: { in: interviewIds } } });
        await prisma.notetakerConsent.updateMany({ where: { companyId, interviewId: { in: interviewIds } }, data: { participantEmail: ERASED_EMAIL } });
      }
      await prisma.interviewBookingInvite.deleteMany({ where: { applicationId: { in: ctx.applicationIds } } });
    },
  },
  {
    // Runs after the other storage steps so a failed attachment delete is recorded on this step alone.
    name: "inbound-messages",
    run: async (ctx) => {
      const where = linkedByCandidateOrApplication(ctx);
      const rows = await prisma.inboundEmailMessage.findMany({ where, select: { id: true, storageKey: true } });
      if (rows.length === 0) return;
      const ids = rows.map((row) => row.id);
      await prisma.inboundEmailMessage.updateMany({
        where: { companyId: ctx.companyId, id: { in: ids } },
        data: { applicantName: "ERASED", emailMasked: null, applicantEmailNormalized: null },
      });
      await deleteObjects(ctx, rows.map((row) => row.storageKey));
      await prisma.inboundEmailMessage.updateMany({
        where: { companyId: ctx.companyId, id: { in: ids } },
        data: { storageKey: null },
      });
    },
  },
  {
    name: "import-rows",
    run: async (ctx) => {
      await prisma.applicantImportRow.updateMany({
        where: linkedByCandidateOrApplication(ctx),
        data: { name: "ERASED", emailMasked: null, externalCandidateId: null },
      });
    },
  },
  {
    name: "decision-rationales",
    run: async (ctx) => {
      if (ctx.applicationIds.length === 0) return;
      await prisma.decisionRecord.updateMany({
        where: { companyId: ctx.companyId, applicationId: { in: ctx.applicationIds } },
        data: { rationale: "erased" },
      });
    },
  },
];

/** True when another candidate, or a portal identity, that is not erased uses this address, in any tenant. Existence only. */
async function addressUsedByAnotherPerson(email: string, candidateId: number): Promise<boolean> {
  const [events, submissions, portal] = await Promise.all([
    prisma.applicationIngestionEvent.count({ where: { applicantEmailNormalized: email, OR: [{ candidateId: null }, { candidateId: { not: candidateId } }] } }),
    prisma.hostedApplySubmission.count({ where: { emailNormalized: email, NOT: { ingestionEvent: { candidateId } } } }),
    prisma.candidatePortalIdentity.count({ where: { emailNormalized: email, NOT: { candidateId } } }),
  ]);
  return events + submissions + portal > 0;
}

async function loadContext(companyId: number, candidateId: number, deps: ErasureDeps): Promise<Ctx> {
  const [applications, evidence, events, submissions] = await Promise.all([
    prisma.application.findMany({ where: { candidateId, companyId }, select: { id: true } }),
    prisma.candidateEvidence.findMany({ where: { candidateId, companyId }, select: { id: true } }),
    prisma.applicationIngestionEvent.findMany({
      where: { candidateId, companyId },
      select: { hostedApplySubmissionId: true, applicantEmailNormalized: true },
    }),
    prisma.hostedApplySubmission.findMany({
      where: { companyId, ingestionEvent: { candidateId } },
      select: { id: true, emailNormalized: true },
    }),
  ]);
  const submissionIds = new Set<number>(submissions.map((row) => row.id));
  for (const event of events) if (event.hostedApplySubmissionId) submissionIds.add(event.hostedApplySubmissionId);
  const emails = [
    ...events.map((row) => row.applicantEmailNormalized),
    ...submissions.map((row) => row.emailNormalized),
  ].filter((value): value is string => Boolean(value) && !value!.endsWith("@erased.invalid"));
  return {
    companyId,
    candidateId,
    deps,
    applicationIds: applications.map((row) => row.id),
    evidenceIds: evidence.map((row) => row.id),
    submissionIds: [...submissionIds],
    emails: [...new Set(emails)],
    storage: { deleted: 0, absent: 0, failed: 0 },
    legacyEmail: { sanitized: 0, cancelledOnly: 0, leftAmbiguous: 0 },
  };
}

export async function eraseCandidate(input: {
  companyId: number;
  candidateId: number;
  trigger: ErasureTrigger;
  requestedByUserId?: number | null;
  deps?: ErasureDeps;
}): Promise<ErasureResult> {
  const candidate = await prisma.candidate.findFirst({
    where: { id: input.candidateId, companyId: input.companyId },
    select: { id: true, erasedAt: true },
  });
  if (!candidate) throw new CandidateErasureError("CANDIDATE_NOT_FOUND");

  // The tombstone goes first, and keeps its original time on repeat runs.
  if (!candidate.erasedAt) {
    await prisma.candidate.update({ where: { id: candidate.id }, data: { erasedAt: new Date() } });
  }
  const ledger = await prisma.candidateErasure.upsert({
    where: { companyId_candidateId: { companyId: input.companyId, candidateId: input.candidateId } },
    create: {
      companyId: input.companyId,
      candidateId: input.candidateId,
      trigger: input.trigger,
      requestedByUserId: input.requestedByUserId ?? null,
      attempts: 1,
    },
    update: { attempts: { increment: 1 } },
  });

  const ctx = await loadContext(input.companyId, input.candidateId, input.deps ?? defaultDeps);
  const completed: string[] = [];
  const failed: string[] = [];
  for (const step of STEPS) {
    if (step.requires?.some((name) => !completed.includes(name))) {
      failed.push(step.name);
      continue;
    }
    try {
      await step.run(ctx);
      completed.push(step.name);
    } catch {
      failed.push(step.name);
    }
  }

  const status = failed.length === 0 ? "COMPLETED" : "PARTIAL";
  await prisma.candidateErasure.update({
    where: { id: ledger.id },
    data: {
      status,
      completedSteps: completed,
      failedSteps: failed,
      completedAt: status === "COMPLETED" ? (ledger.completedAt ?? new Date()) : null,
    },
  });
  return {
    candidateId: input.candidateId,
    companyId: input.companyId,
    status,
    completedSteps: completed,
    failedSteps: failed,
    attempts: ledger.attempts,
    storage: ctx.storage,
    legacyEmail: ctx.legacyEmail,
  };
}

/** Re-runs erasures that did not finish. Tenant scoped by the ledger row itself. */
export async function retryIncompleteErasures(input: { limit?: number; deps?: ErasureDeps; companyIds?: number[] } = {}) {
  const rows = await prisma.candidateErasure.findMany({
    where: { status: { in: ["PENDING", "PARTIAL"] }, ...(input.companyIds ? { companyId: { in: input.companyIds } } : {}) },
    orderBy: { updatedAt: "asc" },
    take: input.limit ?? 25,
    select: { companyId: true, candidateId: true, trigger: true, requestedByUserId: true },
  });
  let completed = 0;
  let stillPartial = 0;
  for (const row of rows) {
    const result = await eraseCandidate({
      companyId: row.companyId,
      candidateId: row.candidateId,
      trigger: row.trigger as ErasureTrigger,
      requestedByUserId: row.requestedByUserId,
      deps: input.deps,
    }).catch(() => null);
    if (result?.status === "COMPLETED") completed += 1;
    else stillPartial += 1;
  }
  return { attempted: rows.length, completed, stillPartial };
}
