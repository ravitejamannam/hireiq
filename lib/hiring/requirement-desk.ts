import type { Prisma } from "@prisma/client";

import { jobScopeWhere, requireUser } from "@/lib/auth/authorization";
import {
  buildApplicationTimeline,
  mergeHiringTimelines,
  type HiringTimelineEvent,
  type TimelineApplicationInput,
} from "@/lib/hiring/application-timeline";
import {
  buildHiringFunnelReport,
  type ApplicationFunnelSnapshot,
  type HiringFunnelReport,
} from "@/lib/hiring/funnel";
import { resolveApplicationSourceLabel } from "@/lib/hiring/ingestion-source";
import {
  INTERVIEW_RESULT_LABELS,
  INTERVIEW_TYPE_LABELS,
  interviewRoundProgress,
  type InterviewRoundProgress,
} from "@/lib/hiring/interview-rounds";
import { prisma } from "@/lib/prisma";

export type RequirementHiringDesk = HiringFunnelReport & {
  interviewRounds: InterviewRoundProgress[];
  events: HiringTimelineEvent[];
};

const deskApplicationSelect = {
  id: true,
  createdAt: true,
  status: true,
  source: true,
  shortlistedAt: true,
  offerMintedAt: true,
  offerAcceptedAt: true,
  offerDeclinedAt: true,
  candidate: { select: { name: true } },
  job: { select: { title: true, interviewRoundPlan: true } },
  billingLineItem: { select: { createdAt: true } },
  bookingInvite: { select: { usedAt: true } },
  assessmentInvite: {
    select: {
      startedAt: true,
      attempt: {
        select: {
          startedAt: true,
          submittedAt: true,
          score: true,
          maxScore: true,
        },
      },
    },
  },
  ingestionEvents: {
    orderBy: { receivedAt: "desc" as const },
    take: 1,
    select: {
      sourceChannel: true,
      hostedApplySubmissionId: true,
    },
  },
  evaluations: {
    select: { id: true, evaluatedAt: true, createdAt: true },
  },
  interviews: {
    select: {
      id: true,
      type: true,
      interviewAt: true,
      result: true,
    },
  },
  rankingResults: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { rank: true, createdAt: true },
  },
} satisfies Prisma.ApplicationSelect;

type DeskApplicationRow = Prisma.ApplicationGetPayload<{
  select: typeof deskApplicationSelect;
}>;

function toSnapshot(row: DeskApplicationRow): ApplicationFunnelSnapshot {
  const latestIngestion = row.ingestionEvents[0] ?? null;
  const assessment = row.assessmentInvite?.attempt ?? null;
  const interviewBookedAt =
    row.bookingInvite?.usedAt ??
    row.interviews.reduce<Date | null>((earliest, interview) => {
      if (!earliest || interview.interviewAt < earliest) {
        return interview.interviewAt;
      }
      return earliest;
    }, null);

  return {
    createdAt: row.createdAt,
    status: row.status,
    shortlistedAt: row.shortlistedAt,
    assessmentSubmittedAt: assessment?.submittedAt ?? null,
    interviewBookedAt,
    offerMintedAt: row.offerMintedAt,
    offerAcceptedAt: row.offerAcceptedAt,
    billedAt: row.billingLineItem?.createdAt ?? null,
    sourceChannel: latestIngestion?.sourceChannel ?? null,
    sourcingDatabaseSource: row.source,
    hostedApplySubmissionId: latestIngestion?.hostedApplySubmissionId ?? null,
  };
}

function toTimelineInput(row: DeskApplicationRow): TimelineApplicationInput {
  const latestIngestion = row.ingestionEvents[0] ?? null;
  const attempt = row.assessmentInvite?.attempt ?? null;
  const ranking = row.rankingResults[0] ?? null;

  return {
    id: row.id,
    createdAt: row.createdAt,
    status: row.status,
    shortlistedAt: row.shortlistedAt,
    offerMintedAt: row.offerMintedAt,
    offerAcceptedAt: row.offerAcceptedAt,
    offerDeclinedAt: row.offerDeclinedAt,
    candidateName: row.candidate.name,
    jobTitle: row.job.title,
    sourceLabel: resolveApplicationSourceLabel({
      sourceChannel: latestIngestion?.sourceChannel,
      sourcingDatabaseSource: row.source,
      hostedApplySubmissionId: latestIngestion?.hostedApplySubmissionId,
    }),
    assessmentStartedAt:
      attempt?.startedAt ?? row.assessmentInvite?.startedAt ?? null,
    assessmentSubmittedAt: attempt?.submittedAt ?? null,
    assessmentScore: attempt?.score ?? null,
    assessmentMaxScore: attempt?.maxScore ?? null,
    evaluations: row.evaluations.map((evaluation) => ({
      id: evaluation.id,
      evaluatedAt: evaluation.evaluatedAt,
      createdAt: evaluation.createdAt,
    })),
    interviews: row.interviews.map((interview) => ({
      id: interview.id,
      typeLabel: INTERVIEW_TYPE_LABELS[interview.type],
      interviewAt: interview.interviewAt,
      resultLabel: INTERVIEW_RESULT_LABELS[interview.result] ?? interview.result,
    })),
    bookingUsedAt: row.bookingInvite?.usedAt ?? null,
    ranking: ranking
      ? { rank: ranking.rank, createdAt: ranking.createdAt }
      : null,
  };
}

export async function getRequirementHiringDesk(
  jobId: number,
): Promise<RequirementHiringDesk | null> {
  const user = await requireUser();
  if (!Number.isInteger(jobId) || jobId <= 0) return null;

  const job = await prisma.job.findFirst({
    where: { id: jobId, ...jobScopeWhere(user) },
    select: { id: true, interviewRoundPlan: true },
  });
  if (!job) return null;

  const rows = await prisma.application.findMany({
    where: {
      jobId,
      job: jobScopeWhere(user),
    },
    select: deskApplicationSelect,
    orderBy: { createdAt: "desc" },
  });

  const report = buildHiringFunnelReport(rows.map(toSnapshot));
  const interviews = rows.flatMap((row) =>
    row.interviews.map((interview) => ({
      type: interview.type,
      result: interview.result,
    })),
  );

  return {
    ...report,
    interviewRounds: interviewRoundProgress(job.interviewRoundPlan, interviews),
    events: mergeHiringTimelines(rows.map(toTimelineInput)).slice(0, 40),
  };
}

export async function getApplicationHiringTimeline(
  applicationId: number,
): Promise<HiringTimelineEvent[] | null> {
  const user = await requireUser();
  if (!Number.isInteger(applicationId) || applicationId <= 0) return null;

  const row = await prisma.application.findFirst({
    where: {
      id: applicationId,
      job: jobScopeWhere(user),
    },
    select: deskApplicationSelect,
  });
  if (!row) return null;

  return buildApplicationTimeline(toTimelineInput(row));
}

export async function getCandidateHiringTimelines(
  candidateId: number,
): Promise<HiringTimelineEvent[]> {
  const user = await requireUser();
  if (!Number.isInteger(candidateId) || candidateId <= 0) return [];

  const rows = await prisma.application.findMany({
    where: {
      candidateId,
      job: jobScopeWhere(user),
    },
    select: deskApplicationSelect,
    orderBy: { createdAt: "desc" },
  });

  return mergeHiringTimelines(rows.map(toTimelineInput));
}

export async function getAnalyticsFunnelSnapshots(companyId?: number | null) {
  await requireUser();
  const rows = await prisma.application.findMany({
    where: companyId ? { companyId } : {},
    select: deskApplicationSelect,
  });
  return rows.map(toSnapshot);
}
