import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** Stores a DSAR erasure must cover: database rows, resume files, and retrieval indexes. */
export const CANDIDATE_ERASURE_STORES = ["database", "files", "retrieval-indexes"] as const;

export const CANDIDATE_DELETION_REFUSED =
  "This candidate has associated records. Ordinary deletion is unavailable.";

export class CandidateDeletionRefused extends Error {
  constructor() {
    super(CANDIDATE_DELETION_REFUSED);
    this.name = "CandidateDeletionRefused";
  }
}

export class CandidateDeletionNotFound extends Error {
  constructor() {
    super("Candidate was not found.");
    this.name = "CandidateDeletionNotFound";
  }
}

export function refusalFromDeleteError(
  error: unknown,
): CandidateDeletionRefused | null {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  ) {
    return new CandidateDeletionRefused();
  }
  return null;
}

async function hasBlockingRecords(
  tx: Prisma.TransactionClient,
  candidateId: number,
) {
  const counts = await Promise.all([
    tx.application.count({ where: { candidateId } }),
    tx.candidateEvidence.count({ where: { candidateId } }),
    tx.humanRelevanceJudgment.count({ where: { candidateId } }),
    tx.candidateIdentityDecision.count({
      where: {
        OR: [{ leftCandidateId: candidateId }, { rightCandidateId: candidateId }],
      },
    }),
    tx.candidateClaim.count({ where: { candidateId } }),
    tx.candidateIntelligenceRun.count({ where: { candidateId } }),
    tx.candidateMatchRun.count({ where: { candidateId } }),
    tx.jobRankingResult.count({ where: { candidateId } }),
    tx.requirementAssessment.count({ where: { candidateId } }),
    tx.requirementAssessmentRun.count({ where: { candidateId } }),
    tx.lexicalRetrievalResult.count({ where: { candidateId } }),
    tx.semanticRetrievalResult.count({ where: { candidateId } }),
    tx.hybridRetrievalResult.count({ where: { candidateId } }),
    tx.evidenceGraphRun.count({ where: { candidateId } }),
    tx.candidateResumeDocument.count({ where: { candidateId } }),
    tx.candidateProfile.count({ where: { candidateId } }),
    tx.candidateIdentityMembership.count({ where: { candidateId } }),
    tx.candidateIdentitySignal.count({ where: { candidateId } }),
  ]);
  return counts.some((count) => count > 0);
}

export async function deleteUnattachedCandidate(candidateId: number) {
  try {
    await prisma.$transaction(async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { id: candidateId },
        select: { id: true },
      });
      if (!candidate) {
        throw new CandidateDeletionNotFound();
      }
      if (await hasBlockingRecords(tx, candidateId)) {
        throw new CandidateDeletionRefused();
      }
      await tx.candidate.delete({ where: { id: candidateId } });
    });
  } catch (error) {
    if (
      error instanceof CandidateDeletionRefused ||
      error instanceof CandidateDeletionNotFound
    ) {
      throw error;
    }
    const refused = refusalFromDeleteError(error);
    if (refused) throw refused;
    throw error;
  }
}
