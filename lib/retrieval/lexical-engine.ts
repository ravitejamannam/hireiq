import { createHash } from "node:crypto";

import { CandidateClaimPolarity } from "@prisma/client";

import { extractClaimsDeterministically } from "@/lib/candidates/intelligence/deterministic-extractor";
import { normalizeMatchingText } from "@/lib/candidates/matching/skill-tokenizer";
import type {
  LexicalApplicationDocument,
  LexicalApplicationScore,
  LexicalEvidenceDocument,
  LexicalQuery,
} from "@/lib/retrieval/lexical-retrieval-types";

export function isEligibleRetrievalEvidence(evidence: {
  revokedAt: Date | null;
  supersededById: number | null;
}) {
  return evidence.revokedAt == null && evidence.supersededById == null;
}

export function evidenceBelongsToApplication(
  evidence: Pick<LexicalEvidenceDocument, "applicationId">,
  applicationId: number,
) {
  return evidence.applicationId == null || evidence.applicationId === applicationId;
}

function locationMentioned(text: string, locationKey: string) {
  const normalized = normalizeMatchingText(text);
  const target = normalizeMatchingText(locationKey);
  if (!target) {
    return false;
  }
  return new RegExp(
    `(?<![A-Za-z0-9])${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`,
    "i",
  ).test(normalized);
}

export function scoreLexicalApplication(input: {
  query: LexicalQuery;
  application: LexicalApplicationDocument;
}): LexicalApplicationScore {
  const eligible = input.application.evidence.filter(
    (evidence) =>
      evidence.companyId === input.application.companyId &&
      evidence.candidateId === input.application.candidateId &&
      isEligibleRetrievalEvidence(evidence) &&
      evidenceBelongsToApplication(evidence, input.application.applicationId),
  );

  const matched = new Set<string>();

  for (const evidence of eligible) {
    const text = evidence.inlineText ?? "";
    const claims = extractClaimsDeterministically(text);
    for (const term of input.query.terms) {
      if (matched.has(term.key)) {
        continue;
      }
      if (term.kind === "SKILL") {
        const positive = claims.some(
          (claim) =>
            claim.normalizedValue === term.key &&
            claim.polarity === CandidateClaimPolarity.POSITIVE,
        );
        if (positive) {
          matched.add(term.key);
        }
        continue;
      }
      if (locationMentioned(text, term.key)) {
        matched.add(term.key);
      }
    }
  }

  return {
    applicationId: input.application.applicationId,
    candidateId: input.application.candidateId,
    companyId: input.application.companyId,
    lexicalScore: matched.size,
    matchedTerms: [...matched].sort(),
  };
}

export function assembleLexicalCorpus(input: {
  companyId: number;
  jobId: number;
  applications: Array<{
    id: number;
    candidateId: number;
    companyId: number;
    jobId: number;
  }>;
  evidence: LexicalEvidenceDocument[];
}): LexicalApplicationDocument[] {
  return input.applications
    .filter(
      (application) =>
        application.companyId === input.companyId &&
        application.jobId === input.jobId,
    )
    .map((application) => ({
      applicationId: application.id,
      candidateId: application.candidateId,
      companyId: application.companyId,
      jobId: application.jobId,
      evidence: input.evidence.filter(
        (evidence) =>
          evidence.companyId === input.companyId &&
          evidence.candidateId === application.candidateId,
      ),
    }));
}

export function rankLexicalApplications(input: {
  query: LexicalQuery;
  applications: LexicalApplicationDocument[];
  limit: number;
}): LexicalApplicationScore[] {
  const scored = input.applications
    .filter((application) => application.companyId > 0)
    .map((application) => scoreLexicalApplication({ query: input.query, application }))
    .filter((row) => row.lexicalScore > 0)
    .sort((left, right) => {
      if (right.lexicalScore !== left.lexicalScore) {
        return right.lexicalScore - left.lexicalScore;
      }
      return left.applicationId - right.applicationId;
    });

  return scored.slice(0, input.limit);
}

export function hashEvidenceSnapshot(
  evidence: Array<{ evidenceId: number; contentSha256: string | null }>,
) {
  const lines = evidence
    .map((row) => `${row.evidenceId}:${row.contentSha256 ?? ""}`)
    .sort();
  return createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}

export function explainLexicalRetrieval(score: LexicalApplicationScore) {
  if (score.matchedTerms.length === 0) {
    return "Not retrieved. No positive lexical overlap with structured job requirement terms.";
  }
  return `Retrieved because eligible evidence positively mentioned: ${score.matchedTerms.join(", ")}. This is lexical overlap, not candidate quality.`;
}
