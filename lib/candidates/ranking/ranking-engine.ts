import { createHash } from "node:crypto";

import {
  CandidateMatchRequirementCategory,
  CandidateMatchResult,
  JobRankingCoverageStatus,
} from "@prisma/client";

import type {
  RankingApplicationInput,
  RankingComputation,
  RankingResultDraft,
} from "@/lib/candidates/ranking/ranking-types";

export function hashApplicationSet(
  entries: Array<{ applicationId: number; candidateMatchRunId: number | null }>,
) {
  const lines = [...entries]
    .sort((left, right) => left.applicationId - right.applicationId)
    .map(
      (entry) =>
        `${entry.applicationId}:${entry.candidateMatchRunId ?? "none"}`,
    );
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}

export function countSkillCoverage(rows: RankingApplicationInput["requirementRows"]) {
  let satisfiedSkillCount = 0;
  let unknownSkillCount = 0;
  for (const row of rows) {
    if (row.category !== CandidateMatchRequirementCategory.SKILL) {
      continue;
    }
    if (row.result === CandidateMatchResult.SATISFIED) {
      satisfiedSkillCount += 1;
    } else if (row.result === CandidateMatchResult.UNKNOWN) {
      unknownSkillCount += 1;
    }
  }
  return { satisfiedSkillCount, unknownSkillCount };
}

export function computeJobRanking(
  applications: RankingApplicationInput[],
): RankingComputation {
  const ranked: RankingResultDraft[] = [];
  const unranked: RankingResultDraft[] = [];

  for (const application of applications) {
    if (application.candidateMatchRunId === null) {
      unranked.push({
        applicationId: application.applicationId,
        candidateId: application.candidateId,
        candidateMatchRunId: null,
        rank: null,
        satisfiedSkillCount: null,
        unknownSkillCount: null,
        coverageStatus: JobRankingCoverageStatus.UNRANKED_NO_MATCH,
      });
      continue;
    }

    const coverage = countSkillCoverage(application.requirementRows);
    ranked.push({
      applicationId: application.applicationId,
      candidateId: application.candidateId,
      candidateMatchRunId: application.candidateMatchRunId,
      rank: null,
      satisfiedSkillCount: coverage.satisfiedSkillCount,
      unknownSkillCount: coverage.unknownSkillCount,
      coverageStatus: JobRankingCoverageStatus.RANKED,
    });
  }

  if (ranked.length === 0) {
    return { kind: "no_match_runs" };
  }

  ranked.sort((left, right) => {
    const leftCount = left.satisfiedSkillCount ?? 0;
    const rightCount = right.satisfiedSkillCount ?? 0;
    if (leftCount !== rightCount) {
      return rightCount - leftCount;
    }
    return left.applicationId - right.applicationId;
  });

  const rankedWithOrder = ranked.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));

  unranked.sort((left, right) => left.applicationId - right.applicationId);

  return {
    kind: "ranked",
    results: [...rankedWithOrder, ...unranked],
    rankedCount: rankedWithOrder.length,
    unrankedCount: unranked.length,
  };
}
