import { retentionDue } from "@/lib/privacy/retention";

export const REDISCOVERY_STALE_MONTHS = 12;
export const REDISCOVERY_MATCHER_LIMIT = 50;
export const TALENT_REDISCOVERY_FEATURE = "talent_rediscovery";

export type RediscoveryCandidate = {
  candidateId: number;
  activeOnThisJob: boolean;
  withdrawn: boolean;
  deletionRequested: boolean;
  optedOut: boolean;
  futureRolesConsent: boolean;
  rejectedForThisRoleAt: Date | null;
  latestActivityAt: Date;
  resumeUpdatedAt: Date | null;
  receivedAt: Date;
};

export function rediscoveryExclusion(input: {
  person: RediscoveryCandidate;
  now: Date;
  rejectWindowDays: number;
  retentionJurisdiction: string;
  keyword: string | null;
}) {
  const person = input.person;
  if (person.activeOnThisJob) return "active";
  if (person.withdrawn) return "withdrawn";
  if (person.deletionRequested) return "deletion";
  if (!person.futureRolesConsent) return "no-consent";
  const due = retentionDue({ jurisdiction: input.retentionJurisdiction, receivedAt: person.receivedAt });
  if (due.getTime() < input.now.getTime()) return "retention";
  if (person.rejectedForThisRoleAt) {
    const age = input.now.getTime() - person.rejectedForThisRoleAt.getTime();
    if (age < input.rejectWindowDays * 24 * 60 * 60 * 1000) return "recent-reject";
  }
  if (person.optedOut && !input.keyword?.trim()) return "opt-out";
  return null;
}

export function rediscoveryPerson(input: {
  candidateId: number;
  jobId: number;
  candidateUpdatedAt: Date;
  candidateCreatedAt: Date;
  applications: Array<{
    jobId: number;
    withdrawnAt: Date | null;
    status: string;
    aiEvaluationOptOut: boolean;
    futureRolesConsent: boolean;
    updatedAt: Date;
    createdAt: Date;
  }>;
  deletionRequested: boolean;
  resumeUpdatedAt: Date | null;
}): RediscoveryCandidate {
  const onThisJob = input.applications.filter((row) => row.jobId === input.jobId);
  const rejected = onThisJob.find((row) => row.status === "REJECTED");
  return {
    candidateId: input.candidateId,
    activeOnThisJob: onThisJob.some((row) => !row.withdrawnAt && row.status !== "REJECTED"),
    withdrawn: input.applications.some((row) => row.withdrawnAt),
    deletionRequested: input.deletionRequested,
    optedOut: input.applications.some((row) => row.aiEvaluationOptOut),
    futureRolesConsent: input.applications.some((row) => row.futureRolesConsent),
    rejectedForThisRoleAt: rejected?.updatedAt ?? null,
    latestActivityAt: input.applications.reduce((latest, row) => (row.updatedAt > latest ? row.updatedAt : latest), input.candidateUpdatedAt),
    resumeUpdatedAt: input.resumeUpdatedAt,
    receivedAt: input.applications.reduce((earliest, row) => (row.createdAt < earliest ? row.createdAt : earliest), input.candidateCreatedAt),
  };
}

export function visibleRediscoveryRows<T extends { candidateId: number }>(input: {
  rows: T[];
  people: RediscoveryCandidate[];
  hiddenIds: number[];
  now: Date;
  rejectWindowDays: number;
  retentionJurisdiction: string;
}) {
  const people = new Map(input.people.map((person) => [person.candidateId, person]));
  const hidden = new Set(input.hiddenIds);
  return input.rows.filter((row) => {
    if (hidden.has(row.candidateId)) return false;
    const person = people.get(row.candidateId);
    if (!person) return false;
    return rediscoveryExclusion({
      person,
      now: input.now,
      rejectWindowDays: input.rejectWindowDays,
      retentionJurisdiction: input.retentionJurisdiction,
      keyword: null,
    }) === null;
  });
}

export function resumeIsStale(updatedAt: Date | null, now: Date) {
  if (!updatedAt) return true;
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - REDISCOVERY_STALE_MONTHS);
  return updatedAt.getTime() < cutoff.getTime();
}

export function rankRediscovery<T extends { coverage: number; latestActivityAt: Date; interviewScore: number | null }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    if (right.coverage !== left.coverage) return right.coverage - left.coverage;
    const activity = right.latestActivityAt.getTime() - left.latestActivityAt.getTime();
    if (activity !== 0) return activity;
    return (right.interviewScore ?? -1) - (left.interviewScore ?? -1);
  });
}

export function coverageFromMatches(rows: Array<{ result: string }>) {
  if (rows.length === 0) return 0;
  return rows.filter((row) => row.result === "SATISFIED").length / rows.length;
}
