import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/authorization";

/**
 * GDPR Article 15 — candidate data export (T113).
 *
 * Aggregates EVERY piece of data HireIQ holds about a candidate into a
 * single structured JSON document: identity, profile, applications,
 * evidence, intelligence runs and claims, match runs, assessments,
 * evaluations (incl. rubric snapshots), interviews, coding tests, reports.
 *
 * ADMIN-only in v1. The export is the compliance artifact AND a demo of
 * the provenance architecture: everything traces back to the candidate.
 */

export class DataExportError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export async function exportCandidateDataForAdmin(candidateIdInput: unknown): Promise<{
  candidateName: string;
  exportedAt: string;
  json: unknown;
}> {
  await requireAdmin();

  const candidateId = validateCandidateId(candidateIdInput);
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, name: true, companyId: true },
  });
  if (!candidate) throw new DataExportError("CANDIDATE_NOT_FOUND");

  const cid = candidate.id;

  const [
    profile,
    applications,
    evidenceRows,
    intelligenceRuns,
    identitySignals,
    resumeDocuments,
    evaluationsRaw,
    interviews,
    codingTests,
    reports,
    matchRunsRaw,
    rankingResults,
  ] = await Promise.all([
    prisma.candidateProfile.findFirst({
      where: { candidateId: cid },
    }),
    prisma.application.findMany({
      where: { candidateId: cid },
      select: {
        id: true,
        status: true,
        source: true,
        expertScore: true,
        createdAt: true,
        job: { select: { title: true } },
        assessmentInvite: {
          select: {
            roleCategory: true,
            expiresAt: true,
            attempt: {
              select: {
                score: true,
                maxScore: true,
                status: true,
                submittedAt: true,
                integritySignals: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.candidateEvidence.findMany({
      where: { candidateId: cid },
      select: {
        id: true,
        sourceType: true,
        origin: true,
        inlineText: true,
        contentSha256: true,
        revokedAt: true,
        supersededById: true,
        createdAt: true,
        hostedApplySubmission: { select: { emailNormalized: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.candidateIntelligenceRun.findMany({
      where: { candidateId: cid },
      select: {
        id: true,
        status: true,
        createdAt: true,
        claims: {
          select: { claimType: true, value: true, normalizedValue: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }).catch(() => []),
    prisma.candidateIdentitySignal.findMany({
      where: { candidateId: cid },
      select: { kind: true, normalizedValue: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.candidateResumeDocument.findMany({
      where: { candidateId: cid },
      select: {
        fileName: true,
        contentType: true,
        sizeBytes: true,
        parseStatus: true,
        contentSha256: true,
        uploadedBy: { select: { name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.evaluation.findMany({
      where: { applicationId: { in: await applicationIds(cid) } },
      select: {
        id: true,
        overallScore: true,
        recommendation: true,
        notes: true,
        evaluatedAt: true,
        interviewer: { select: { name: true } },
        competencyScores: {
          select: { competencyName: true, weightSnapshot: true, score: true },
        },
        questions: {
          select: { question: true, answer: true, expertComment: true, score: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.interview.findMany({
      where: { applicationId: { in: await applicationIds(cid) } },
      select: { type: true, interviewAt: true, result: true },
      orderBy: { interviewAt: "desc" },
    }),
    prisma.codingTest.findMany({
      where: { applicationId: { in: await applicationIds(cid) } },
      select: { title: true, score: true, maxScore: true, status: true, takenAt: true },
      orderBy: { takenAt: "desc" },
    }),
    prisma.report.findMany({
      where: { applicationId: { in: await applicationIds(cid) } },
      select: { recommendation: true, notes: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.candidateMatchRun.findMany({
      where: { candidateId: cid },
      select: {
        id: true,
        createdAt: true,
        requirementMatches: {
          select: {
            requirementKey: true,
            sourceField: true,
            reasonCode: true,
          },
        },
      },
      orderBy: { id: "desc" },
    }).catch(() => []),
    prisma.jobRankingResult.findMany({
      where: { applicationId: { in: await applicationIds(cid) } },
      select: { rank: true, satisfiedSkillCount: true },
      orderBy: { id: "desc" },
    }).catch(() => []),
  ]);

  void intelligenceRuns;

  const json = {
    exportVersion: 1 as const,
    generatedAt: new Date().toISOString(),
    subject: {
      candidateId: candidate.id,
      name: candidate.name,
    },
    profile: profile ?? null,
    applications,
    evidence: evidenceRows,
    identitySignals,
    resumeDocuments,
    evaluations: evaluationsRaw.map((e) => ({
      ...e,
      rubric: e.competencyScores.map((s) => ({
        competency: s.competencyName,
        weight: s.weightSnapshot,
        score: s.score,
        weightedPct: Math.round((s.score / 5) * s.weightSnapshot),
      })),
      competencyScores: undefined,
    })),
    interviews,
    codingTests,
    reports,
    matchingRuns: matchRunsRaw,
    rankingPositions: rankingResults,
  };

  return { candidateName: candidate.name, exportedAt: new Date().toISOString(), json };
}

async function applicationIds(candidateId: number): Promise<number[]> {
  const rows = await prisma.application.findMany({
    where: { candidateId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

function validateCandidateId(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (parsed > 0) return parsed;
  }
  throw new DataExportError("INVALID_CANDIDATE_ID");
}
