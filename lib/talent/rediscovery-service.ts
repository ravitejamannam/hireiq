import { CandidateClaimPolarity, JobRequirementCategory } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/write-audit-log";
import { generateSecureToken, hashSecureToken } from "@/lib/auth/secure-token";
import { computeRequirementMatches } from "@/lib/candidates/matching/matching-engine";
import type { EligibleMatchingClaim } from "@/lib/candidates/matching/matching-types";
import { sendOutboundEmail } from "@/lib/communication/email-transport";
import { issuePortalLink } from "@/lib/portal/portal-service";
import { prisma } from "@/lib/prisma";
import { embedRetrievalTexts } from "@/lib/retrieval/semantic-embedder";
import { scoreLexicalApplication } from "@/lib/retrieval/lexical-engine";
import { canonicalSkillKey } from "@/lib/ontology/skill-alias";
import {
  REDISCOVERY_MATCHER_LIMIT,
  TALENT_REDISCOVERY_FEATURE,
  coverageFromMatches,
  rankRediscovery,
  rediscoveryExclusion,
  rediscoveryPerson,
  resumeIsStale,
  visibleRediscoveryRows,
} from "@/lib/talent/rediscovery";

const STAGE_RANK = ["CV_POOL", "EXPERT_REVIEW", "TECH_EVALUATION", "SHORTLISTED", "SELECTED", "HIRED", "REJECTED"];

function furthest(statuses: string[]) {
  return statuses.reduce((best, status) => (STAGE_RANK.indexOf(status) > STAGE_RANK.indexOf(best) ? status : best), statuses[0] ?? "CV_POOL");
}

function bestSubmittedScore(applications: Array<{ evaluations: Array<{ overallScore: number | null }> }>) {
  const scores = applications.flatMap((application) =>
    application.evaluations.flatMap((evaluation) => (evaluation.overallScore == null ? [] : [evaluation.overallScore])),
  );
  if (scores.length === 0) return null;
  return Math.max(...scores);
}

function skillTerms(spec: { primarySkills: string | null; mustHaveRequirements: string | null; niceToHaveRequirements: string | null }) {
  const raw = [spec.primarySkills, spec.mustHaveRequirements, spec.niceToHaveRequirements].filter(Boolean).join("\n");
  const keys = new Set<string>();
  for (const token of raw.split(/[^A-Za-z0-9+#.]+/)) {
    const key = canonicalSkillKey(token);
    if (key) keys.add(key);
  }
  return [...keys].map((key) => ({
    key,
    kind: "SKILL" as const,
    sourceText: key,
    category: JobRequirementCategory.REQUIRED,
  }));
}

export async function runTalentRediscovery(input: { jobId: number; keyword?: string | null }) {
  const job = await prisma.job.findUnique({
    where: { id: input.jobId },
    include: {
      company: { select: { id: true, rediscoveryRejectDays: true, retentionPolicy: true } },
      currentPublishedSpecificationVersion: true,
    },
  });
  if (!job?.currentPublishedSpecificationVersion) throw new Error("Publish a specification before searching past candidates.");
  const spec = job.currentPublishedSpecificationVersion;
  const now = new Date();
  const jurisdiction = job.company.retentionPolicy?.jurisdiction ?? "GDPR";
  const hidden = new Set((await prisma.talentRediscoveryAction.findMany({
    where: { jobId: job.id, kind: "HIDDEN" },
    select: { candidateId: true },
  })).map((row) => row.candidateId));

  const candidates = await prisma.candidate.findMany({
    where: { companyId: job.companyId, evidence: { some: { revokedAt: null, inlineText: { not: "" } } } },
    take: 200,
    include: {
      applications: {
        include: {
          evaluations: { where: { submittedAt: { not: null } }, select: { overallScore: true } },
        },
      },
      evidence: { where: { revokedAt: null, supersededById: null }, orderBy: { createdAt: "desc" }, take: 3 },
      intelligenceClaims: { where: { polarity: CandidateClaimPolarity.POSITIVE }, take: 40 },
      deletionRequests: { where: { status: { in: ["QUEUED", "COMPLETED"] } }, take: 1 },
    },
  });

  const keyword = input.keyword?.trim() || null;
  const pool = [];
  for (const candidate of candidates) {
    const reason = rediscoveryExclusion({
      person: rediscoveryPerson({
        candidateId: candidate.id,
        jobId: job.id,
        candidateUpdatedAt: candidate.updatedAt,
        candidateCreatedAt: candidate.createdAt,
        applications: candidate.applications,
        deletionRequested: candidate.deletionRequests.length > 0,
        resumeUpdatedAt: candidate.evidence[0]?.createdAt ?? null,
      }),
      now,
      rejectWindowDays: job.company.rediscoveryRejectDays,
      retentionJurisdiction: jurisdiction,
      keyword,
    });
    if (reason || hidden.has(candidate.id)) continue;
    const text = candidate.evidence.map((row) => row.inlineText ?? "").join("\n");
    if (keyword && !text.toLowerCase().includes(keyword.toLowerCase())) continue;
    const lexical = scoreLexicalApplication({
      query: { terms: skillTerms(spec) },
      application: {
        applicationId: candidate.applications[0]?.id ?? 0,
        candidateId: candidate.id,
        companyId: job.companyId,
        jobId: candidate.applications[0]?.jobId ?? 0,
        evidence: candidate.evidence.map((row) => ({
          evidenceId: row.id,
          applicationId: row.applicationId,
          candidateId: row.candidateId,
          companyId: row.companyId,
          inlineText: row.inlineText,
          contentSha256: row.contentSha256,
          revokedAt: row.revokedAt,
          supersededById: row.supersededById,
        })),
      },
    });
    if (lexical.lexicalScore <= 0 && !keyword) continue;
    pool.push({ candidate, text, lexical, latest: candidate.applications.reduce((latest, row) => row.updatedAt > latest ? row.updatedAt : latest, candidate.updatedAt) });
  }

  let semantic: number[] | null = null;
  if (!keyword && process.env.VITEST !== "true" && process.env.OPENAI_API_KEY?.trim()) {
    try {
      const embedded = await embedRetrievalTexts([`${spec.primarySkills ?? ""}\n${spec.mustHaveRequirements ?? ""}`], {
        companyId: job.companyId,
        entityType: "Job",
        entityId: job.id,
        feature: TALENT_REDISCOVERY_FEATURE,
      });
      semantic = embedded.vectors[0] ?? null;
    } catch {
      semantic = null;
    }
  }

  const filtered = pool
    .sort((left, right) => right.lexical.lexicalScore - left.lexical.lexicalScore)
    .slice(0, REDISCOVERY_MATCHER_LIMIT);
  void semantic;

  const results = filtered.map((row) => {
    const claims: EligibleMatchingClaim[] = row.candidate.intelligenceClaims.flatMap((claim) => {
      if (claim.claimType !== "SKILL" && claim.claimType !== "LOCATION") return [];
      if (!claim.normalizedValue) return [];
      return [{
        id: claim.id,
        evidenceId: claim.evidenceId,
        runId: claim.runId,
        runCompletedAt: claim.createdAt,
        claimType: claim.claimType,
        normalizedValue: claim.normalizedValue,
      }];
    });
    const matches = keyword ? [] : computeRequirementMatches({
      spec: {
        primarySkills: spec.primarySkills,
        location: spec.location,
        mustHaveRequirements: spec.mustHaveRequirements,
        niceToHaveRequirements: spec.niceToHaveRequirements,
        resumeText: row.text,
        profileLocation: row.candidate.location,
      },
      claims,
    });
    const quotes = matches.flatMap((match) => {
      if (match.result !== "SATISFIED") return [];
      const claim = row.candidate.intelligenceClaims.find((item) => item.id === match.claimId);
      return [claim?.value ?? match.requirementKey];
    });
    return {
      candidateId: row.candidate.id,
      name: row.candidate.name,
      title: row.candidate.role,
      company: row.candidate.currentEmployer,
      coverage: keyword ? 0 : coverageFromMatches(matches),
      latestActivityAt: row.latest.toISOString(),
      manualReview: row.candidate.applications.some((item) => item.aiEvaluationOptOut),
      stale: resumeIsStale(row.candidate.evidence[0]?.createdAt ?? null, now),
      pastJobs: row.candidate.applications.map((item) => item.jobId),
      furthestStage: furthest(row.candidate.applications.map((item) => item.status)),
      rejectionReason: row.candidate.applications.find((item) => item.rejectionReason)?.rejectionReason ?? null,
      interviewScore: bestSubmittedScore(row.candidate.applications),
      quotes,
      requirements: matches.map((match) => ({
        key: match.requirementKey,
        result: match.result,
        quote: row.candidate.intelligenceClaims.find((item) => item.id === match.claimId)?.value ?? null,
      })),
    };
  });

  const ranked = rankRediscovery(results.map((row) => ({ ...row, latestActivityAt: new Date(row.latestActivityAt) }))).map((row) => ({
    ...row,
    latestActivityAt: row.latestActivityAt.toISOString(),
  }));

  await prisma.talentRediscoveryRun.upsert({
    where: { jobId_specificationVersionId: { jobId: job.id, specificationVersionId: spec.id } },
    create: {
      companyId: job.companyId,
      jobId: job.id,
      specificationVersionId: spec.id,
      status: "COMPLETED",
      results: ranked,
      completedAt: now,
    },
    update: { status: "COMPLETED", results: ranked, completedAt: now },
  });
  return ranked;
}

export async function loadTalentRediscovery(jobId: number) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      companyId: true,
      title: true,
      currentPublishedSpecificationVersionId: true,
      company: { select: { rediscoveryRejectDays: true, retentionPolicy: { select: { jurisdiction: true } } } },
    },
  });
  if (!job?.currentPublishedSpecificationVersionId) return { job, results: [] as Awaited<ReturnType<typeof runTalentRediscovery>> };
  const run = await prisma.talentRediscoveryRun.findUnique({
    where: { jobId_specificationVersionId: { jobId, specificationVersionId: job.currentPublishedSpecificationVersionId } },
  });
  const cached = Array.isArray(run?.results) ? run.results as Awaited<ReturnType<typeof runTalentRediscovery>> : [];
  const results = await keepVisibleRediscovery(job, cached);
  return { job, results };
}

async function keepVisibleRediscovery<T extends { candidateId: number }>(
  job: { id: number; companyId: number; company: { rediscoveryRejectDays: number; retentionPolicy: { jurisdiction: string } | null } },
  rows: T[],
) {
  if (rows.length === 0) return rows;
  const [hidden, candidates] = await Promise.all([
    prisma.talentRediscoveryAction.findMany({
      where: { jobId: job.id, kind: "HIDDEN", candidateId: { in: rows.map((row) => row.candidateId) } },
      select: { candidateId: true },
    }),
    prisma.candidate.findMany({
      where: { companyId: job.companyId, id: { in: rows.map((row) => row.candidateId) } },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        applications: {
          select: {
            jobId: true,
            withdrawnAt: true,
            status: true,
            aiEvaluationOptOut: true,
            futureRolesConsent: true,
            updatedAt: true,
            createdAt: true,
          },
        },
        deletionRequests: { where: { status: { in: ["QUEUED", "COMPLETED"] } }, select: { id: true }, take: 1 },
      },
    }),
  ]);
  return visibleRediscoveryRows({
    rows,
    hiddenIds: hidden.map((row) => row.candidateId),
    now: new Date(),
    rejectWindowDays: job.company.rediscoveryRejectDays,
    retentionJurisdiction: job.company.retentionPolicy?.jurisdiction ?? "GDPR",
    people: candidates.map((candidate) => rediscoveryPerson({
      candidateId: candidate.id,
      jobId: job.id,
      candidateUpdatedAt: candidate.updatedAt,
      candidateCreatedAt: candidate.createdAt,
      applications: candidate.applications,
      deletionRequested: candidate.deletionRequests.length > 0,
      resumeUpdatedAt: null,
    })),
  });
}

export async function hideRediscoveredCandidate(input: { jobId: number; candidateId: number; actorUserId: number }) {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: input.jobId }, select: { companyId: true } });
  await prisma.talentRediscoveryAction.upsert({
    where: { jobId_candidateId_kind: { jobId: input.jobId, candidateId: input.candidateId, kind: "HIDDEN" } },
    create: { companyId: job.companyId, jobId: input.jobId, candidateId: input.candidateId, kind: "HIDDEN" },
    update: {},
  });
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: job.companyId,
    action: "REDISCOVERY_HIDDEN",
    targetType: "CANDIDATE",
    targetId: input.candidateId,
    reason: `job ${input.jobId}`,
  });
}

export async function shortlistRediscoveredCandidate(input: { jobId: number; candidateId: number; actorUserId: number }) {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: input.jobId }, select: { companyId: true } });
  await prisma.talentRediscoveryAction.upsert({
    where: { jobId_candidateId_kind: { jobId: input.jobId, candidateId: input.candidateId, kind: "SHORTLISTED" } },
    create: { companyId: job.companyId, jobId: input.jobId, candidateId: input.candidateId, kind: "SHORTLISTED" },
    update: {},
  });
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: job.companyId,
    action: "REDISCOVERY_SHORTLISTED",
    targetType: "CANDIDATE",
    targetId: input.candidateId,
    reason: `job ${input.jobId}`,
  });
}

export async function inviteRediscoveredCandidate(input: { jobId: number; candidateId: number; actorUserId: number; origin: string }) {
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: input.jobId },
    select: { id: true, companyId: true, title: true, company: { select: { name: true } } },
  });
  const identity = await prisma.candidatePortalIdentity.findFirst({
    where: { candidateId: input.candidateId, companyId: job.companyId },
    select: { emailNormalized: true },
  });
  const event = await prisma.applicationIngestionEvent.findFirst({
    where: { candidateId: input.candidateId, companyId: job.companyId, applicantEmailNormalized: { not: null } },
    select: { applicantEmailNormalized: true },
  });
  const email = identity?.emailNormalized ?? event?.applicantEmailNormalized;
  if (!email) throw new Error("This candidate has no email address.");
  const token = generateSecureToken();
  await prisma.talentRediscoveryInvite.upsert({
    where: { jobId_candidateId: { jobId: job.id, candidateId: input.candidateId } },
    create: {
      companyId: job.companyId,
      jobId: job.id,
      candidateId: input.candidateId,
      emailNormalized: email,
      tokenHash: token.tokenHash,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    update: { tokenHash: token.tokenHash, emailNormalized: email, acceptedAt: null, expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
  });
  const url = `${input.origin}/portal/rediscovery/${token.rawToken}`;
  await sendOutboundEmail({
    to: email,
    subject: `${job.company.name} invited you to apply for ${job.title}`,
    text: `You can apply for ${job.title}. This does not create an application until you accept.\n\n${url}`,
    html: `<p>You can apply for ${job.title}. This does not create an application until you accept.</p><p><a href="${url}">Review the invitation</a></p>`,
    scope: { companyId: job.companyId, candidateId: input.candidateId },
  });
  await writeAuditLog(prisma, {
    actorUserId: input.actorUserId,
    actorRole: "ADMIN",
    companyId: job.companyId,
    action: "REDISCOVERY_INVITED",
    targetType: "CANDIDATE",
    targetId: input.candidateId,
    reason: `job ${input.jobId}`,
  });
  return url;
}

export async function acceptRediscoveryInvite(rawToken: string) {
  const invite = await prisma.talentRediscoveryInvite.findUnique({ where: { tokenHash: hashSecureToken(rawToken) } });
  if (!invite || invite.acceptedAt || invite.expiresAt.getTime() < Date.now()) return null;
  const existing = await prisma.application.findUnique({
    where: { candidateId_jobId: { candidateId: invite.candidateId, jobId: invite.jobId } },
  });
  const application = existing ?? await prisma.application.create({
    data: {
      candidateId: invite.candidateId,
      jobId: invite.jobId,
      companyId: invite.companyId,
      status: "CV_POOL",
      futureRolesConsent: true,
    },
  });
  await prisma.talentRediscoveryInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  return application;
}

export async function rerunOpenRediscovery() {
  const jobs = await prisma.job.findMany({
    where: { status: "OPEN", currentPublishedSpecificationVersionId: { not: null } },
    select: { id: true },
    take: 50,
  });
  let ran = 0;
  for (const job of jobs) {
    await runTalentRediscovery({ jobId: job.id }).catch(() => undefined);
    ran += 1;
  }
  return { ran };
}

export async function askPastApplicantsToOptIn(input: { companyId: number; actorUserId: number; origin: string }) {
  const candidates = await prisma.candidate.findMany({
    where: {
      companyId: input.companyId,
      futureRolesAskedAt: null,
      applications: { some: { withdrawnAt: null, futureRolesConsent: false } },
      NOT: { applications: { some: { futureRolesConsent: true } } },
      deletionRequests: { none: { status: { in: ["QUEUED", "COMPLETED"] } } },
    },
    select: { id: true, portalIdentities: { select: { emailNormalized: true }, take: 1 } },
    take: 200,
  });
  let sent = 0;
  for (const candidate of candidates) {
    const fromPortal = candidate.portalIdentities[0]?.emailNormalized;
    const event = fromPortal
      ? null
      : await prisma.applicationIngestionEvent.findFirst({
          where: { candidateId: candidate.id, applicantEmailNormalized: { not: null } },
          select: { applicantEmailNormalized: true },
        });
    const email = fromPortal ?? event?.applicantEmailNormalized;
    if (!email) continue;
    const link = await issuePortalLink(email, input.origin);
    if (!link) continue;
    await sendOutboundEmail({
      to: email,
      subject: "Can we consider you for future roles?",
      text: `You applied before we asked this. If you want to be considered for other open roles, open your portal and choose “Consider me for future roles”. Nothing changes unless you say yes.\n\n${link.url}`,
      html: `<p>You applied before we asked this. If you want to be considered for other open roles, open your portal and choose “Consider me for future roles”. Nothing changes unless you say yes.</p><p><a href="${link.url}">Open your portal</a></p>`,
      scope: { companyId: input.companyId, candidateId: candidate.id },
    });
    await prisma.candidate.update({ where: { id: candidate.id }, data: { futureRolesAskedAt: new Date() } });
    await writeAuditLog(prisma, {
      actorUserId: input.actorUserId,
      actorRole: "ADMIN",
      companyId: input.companyId,
      action: "FUTURE_ROLES_ASKED",
      targetType: "CANDIDATE",
      targetId: candidate.id,
      // No address in the audit row. It is append-only, so personal data written here cannot be erased later.
      reason: "portal link sent",
    });
    sent += 1;
  }
  return { sent };
}

export async function rerunRediscoveryForCandidate(candidateId: number) {
  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { companyId: true } });
  if (!candidate) return;
  const jobs = await prisma.job.findMany({
    where: { companyId: candidate.companyId, status: "OPEN", currentPublishedSpecificationVersionId: { not: null } },
    select: { id: true },
    take: 20,
  });
  for (const job of jobs) {
    await runTalentRediscovery({ jobId: job.id }).catch(() => undefined);
  }
}
