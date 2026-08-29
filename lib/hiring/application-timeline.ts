import { ApplicationPipelineStatus } from "@prisma/client";

/**
 * Hiring-team applicant timeline. Composes existing objects — application,
 * ingestion, assessment, evaluation, interview, ranking, offer — without
 * inventing a combined HireIQ score.
 */

export type HiringTimelineKind =
  | "applied"
  | "assessment_started"
  | "assessment_completed"
  | "evaluation"
  | "interview"
  | "booking"
  | "ranked"
  | "shortlisted"
  | "offer_sent"
  | "offer_accepted"
  | "offer_declined"
  | "hired";

export type HiringTimelineEvent = {
  id: string;
  at: string;
  kind: HiringTimelineKind;
  title: string;
  detail: string | null;
  applicationId: number;
  candidateName: string;
  jobTitle: string;
};

export type TimelineApplicationInput = {
  id: number;
  createdAt: Date;
  status: string;
  shortlistedAt: Date | null;
  offerMintedAt: Date | null;
  offerAcceptedAt: Date | null;
  offerDeclinedAt: Date | null;
  candidateName: string;
  jobTitle: string;
  sourceLabel: string;
  assessmentStartedAt: Date | null;
  assessmentSubmittedAt: Date | null;
  assessmentScore: number | null;
  assessmentMaxScore: number | null;
  evaluations: Array<{ id: number; evaluatedAt: Date | null; createdAt: Date }>;
  interviews: Array<{
    id: number;
    typeLabel: string;
    interviewAt: Date;
    resultLabel: string;
  }>;
  bookingUsedAt: Date | null;
  ranking: { rank: number | null; createdAt: Date } | null;
};

function iso(value: Date): string {
  return value.toISOString();
}

export function buildApplicationTimeline(
  application: TimelineApplicationInput,
): HiringTimelineEvent[] {
  const events: HiringTimelineEvent[] = [];
  const base = {
    applicationId: application.id,
    candidateName: application.candidateName,
    jobTitle: application.jobTitle,
  };

  events.push({
    id: `applied-${application.id}`,
    at: iso(application.createdAt),
    kind: "applied",
    title: "Applied",
    detail: application.sourceLabel,
    ...base,
  });

  if (application.assessmentStartedAt) {
    events.push({
      id: `assessment-started-${application.id}`,
      at: iso(application.assessmentStartedAt),
      kind: "assessment_started",
      title: "Assessment started",
      detail: null,
      ...base,
    });
  }

  if (application.assessmentSubmittedAt) {
    const score =
      application.assessmentScore != null && application.assessmentMaxScore != null
        ? `${application.assessmentScore}/${application.assessmentMaxScore} — assessment score is not a hire decision`
        : "Assessment score is not a hire decision";
    events.push({
      id: `assessment-completed-${application.id}`,
      at: iso(application.assessmentSubmittedAt),
      kind: "assessment_completed",
      title: "Assessment complete",
      detail: score,
      ...base,
    });
  }

  for (const evaluation of application.evaluations) {
    const at = evaluation.evaluatedAt ?? evaluation.createdAt;
    events.push({
      id: `evaluation-${evaluation.id}`,
      at: iso(at),
      kind: "evaluation",
      title: "Interview evaluation recorded",
      detail: evaluation.evaluatedAt ? "Rubric scores are not a hire decision" : null,
      ...base,
    });
  }

  if (application.bookingUsedAt) {
    events.push({
      id: `booking-${application.id}`,
      at: iso(application.bookingUsedAt),
      kind: "booking",
      title: "Interview slot booked",
      detail: null,
      ...base,
    });
  }

  for (const interview of application.interviews) {
    events.push({
      id: `interview-${interview.id}`,
      at: iso(interview.interviewAt),
      kind: "interview",
      title: `${interview.typeLabel} interview`,
      detail: interview.resultLabel,
      ...base,
    });
  }

  if (application.ranking) {
    events.push({
      id: `ranked-${application.id}-${application.ranking.createdAt.getTime()}`,
      at: iso(application.ranking.createdAt),
      kind: "ranked",
      title: "Requirement ranking published",
      detail:
        application.ranking.rank != null
          ? `Rank ${application.ranking.rank} — ranking is not a hire decision`
          : "Unranked — ranking is not a hire decision",
      ...base,
    });
  }

  if (application.shortlistedAt) {
    events.push({
      id: `shortlisted-${application.id}`,
      at: iso(application.shortlistedAt),
      kind: "shortlisted",
      title: "Shortlisted",
      detail: null,
      ...base,
    });
  }

  if (application.offerMintedAt) {
    events.push({
      id: `offer-sent-${application.id}`,
      at: iso(application.offerMintedAt),
      kind: "offer_sent",
      title: "Offer sent",
      detail: null,
      ...base,
    });
  }

  if (application.offerAcceptedAt) {
    events.push({
      id: `offer-accepted-${application.id}`,
      at: iso(application.offerAcceptedAt),
      kind: "offer_accepted",
      title: "Offer accepted",
      detail: null,
      ...base,
    });
  }

  if (application.offerDeclinedAt) {
    events.push({
      id: `offer-declined-${application.id}`,
      at: iso(application.offerDeclinedAt),
      kind: "offer_declined",
      title: "Offer declined",
      detail: null,
      ...base,
    });
  }

  if (application.status === ApplicationPipelineStatus.HIRED) {
    const at = application.offerAcceptedAt ?? application.shortlistedAt ?? application.createdAt;
    events.push({
      id: `hired-${application.id}`,
      at: iso(at),
      kind: "hired",
      title: "Hired",
      detail: null,
      ...base,
    });
  }

  return events.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

export function mergeHiringTimelines(
  applications: TimelineApplicationInput[],
): HiringTimelineEvent[] {
  return applications
    .flatMap((application) => buildApplicationTimeline(application))
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
