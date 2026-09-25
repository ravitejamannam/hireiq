import { CandidateClaimType, JobSpecificationVersionStatus } from "@prisma/client";

import {
  annotateEdgeActivity,
  buildEvidenceGraphEdges,
  hashEvidenceGraphSnapshot,
} from "@/lib/evidence-graph/evidence-graph-engine";
import {
  EVIDENCE_GRAPH_GENERIC_ERROR,
  EVIDENCE_GRAPH_IN_PROGRESS,
  EVIDENCE_GRAPH_INTERNAL_ERROR,
  EVIDENCE_GRAPH_NOT_FOUND,
  EVIDENCE_GRAPH_TENANT_MISMATCH,
  EvidenceGraphError,
} from "@/lib/evidence-graph/evidence-graph-errors";
import type {
  EvidenceGraphPageData,
  SafeEvidenceGraphRun,
} from "@/lib/evidence-graph/evidence-graph-types";
import {
  EVIDENCE_GRAPH_VERSION,
  STALE_EVIDENCE_GRAPH_RUNNING_MS,
} from "@/lib/evidence-graph/evidence-graph-versions";
import { ONTOLOGY_VERSION } from "@/lib/ontology/skill-alias-catalog";
import { prisma } from "@/lib/prisma";
import {
  createEvidenceGraphEdges,
  createEvidenceGraphRun,
  findCompletedEvidenceGraphRun,
  findLatestRunningEvidenceGraphRun,
  getEvidenceGraphRunWithEdges,
  listEvidenceGraphRunsForJob,
  listGraphSourceClaims,
  listGraphSourceEvidence,
  listGraphSourceSkills,
  listLatestCompletedMatcherV2ForApplication,
  markEvidenceGraphRunCompleted,
  markEvidenceGraphRunFailed,
  type EvidenceGraphIdempotencyKey,
  type EvidenceGraphRunRow,
} from "@/lib/repositories/evidence-graph-repository";
import {
  findLatestCompletedJobIntelligenceForSpec,
  getPublishedSpecForJobIntelligence,
  listPublishedSpecsForJob,
} from "@/lib/repositories/job-intelligence-repository";
import { listApplicationsForLexicalRetrieval } from "@/lib/repositories/lexical-retrieval-repository";

function notFound(): never {
  throw new EvidenceGraphError("Resource not found.", EVIDENCE_GRAPH_NOT_FOUND);
}

export function toSafeEvidenceGraphRun(
  row: EvidenceGraphRunRow,
  evidence: Array<{
    evidenceId: number;
    revokedAt: Date | null;
    supersededById: number | null;
  }>,
): SafeEvidenceGraphRun {
  const annotated = annotateEdgeActivity(
    row.edges.map((edge) => ({
      companyId: edge.companyId,
      edgeType: edge.edgeType,
      fromType: edge.fromType,
      fromId: edge.fromId,
      toType: edge.toType,
      toId: edge.toId,
      provenance: edge.provenance,
      sourceEvidenceId: edge.sourceEvidenceId,
      sourceClaimId: edge.sourceClaimId,
      sourceRequirementId: edge.sourceRequirementId,
      sourceAssessmentId: edge.sourceAssessmentId,
      ontologyVersion: edge.ontologyVersion,
      jobSpecificationVersionId: edge.jobSpecificationVersionId,
    })),
    evidence,
  );
  return {
    id: row.id,
    companyId: row.companyId,
    jobId: row.jobId,
    applicationId: row.applicationId,
    candidateId: row.candidateId,
    jobSpecificationVersionId: row.jobSpecificationVersionId,
    jobIntelligenceRunId: row.jobIntelligenceRunId,
    matcherV2RunId: row.matcherV2RunId,
    status: row.status,
    graphVersion: row.graphVersion,
    ontologyVersion: row.ontologyVersion,
    matcherVersion: row.matcherVersion,
    sourceSnapshotHash: row.sourceSnapshotHash,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    errorCode: row.errorCode,
    edges: row.edges.map((edge, index) => ({
      ...edge,
      evidenceActive: annotated[index]?.evidenceActive ?? true,
    })),
  };
}

export async function executeMaterializeEvidenceGraph(input: {
  jobId: number;
  jobSpecificationVersionId: number;
}): Promise<SafeEvidenceGraphRun[]> {
  const spec = await getPublishedSpecForJobIntelligence(
    input.jobSpecificationVersionId,
  );
  if (!spec || spec.status !== JobSpecificationVersionStatus.PUBLISHED) {
    notFound();
  }
  if (spec.jobId !== input.jobId || spec.job.id !== input.jobId) {
    notFound();
  }
  const companyId = spec.job.companyId;
  const intel = await findLatestCompletedJobIntelligenceForSpec(
    spec.id,
    companyId,
  );
  const applications = await listApplicationsForLexicalRetrieval(
    input.jobId,
    companyId,
  );
  if (applications.some((row) => row.companyId !== companyId || row.jobId !== input.jobId)) {
    throw new EvidenceGraphError(
      "Tenant mismatch.",
      EVIDENCE_GRAPH_TENANT_MISMATCH,
    );
  }

  const skills = await listGraphSourceSkills(ONTOLOGY_VERSION);
  const stored: SafeEvidenceGraphRun[] = [];

  for (const application of applications) {
    const evidenceRows = await listGraphSourceEvidence({
      companyId,
      candidateId: application.candidateId,
      applicationId: application.id,
    });
    if (evidenceRows.some((row) => row.companyId !== companyId)) {
      throw new EvidenceGraphError(
        "Tenant mismatch.",
        EVIDENCE_GRAPH_TENANT_MISMATCH,
      );
    }
    const claims = await listGraphSourceClaims({
      companyId,
      candidateId: application.candidateId,
      evidenceIds: evidenceRows.map((row) => row.id),
    });
    if (claims.some((row) => row.companyId !== companyId)) {
      throw new EvidenceGraphError(
        "Tenant mismatch.",
        EVIDENCE_GRAPH_TENANT_MISMATCH,
      );
    }
    const matcher = intel
      ? await listLatestCompletedMatcherV2ForApplication({
          companyId,
          applicationId: application.id,
          jobSpecificationVersionId: spec.id,
        })
      : null;
    if (matcher && matcher.companyId !== companyId) {
      throw new EvidenceGraphError(
        "Tenant mismatch.",
        EVIDENCE_GRAPH_TENANT_MISMATCH,
      );
    }

    const evidence = evidenceRows.map((row) => ({
      evidenceId: row.id,
      companyId: row.companyId,
      candidateId: row.candidateId,
      revokedAt: row.revokedAt,
      supersededById: row.supersededById,
    }));
    const drafts = buildEvidenceGraphEdges({
      companyId,
      applicationId: application.id,
      candidateId: application.candidateId,
      jobSpecificationVersionId: spec.id,
      ontologyVersion: ONTOLOGY_VERSION,
      evidence,
      claims: claims.map((row) => ({
        claimId: row.id,
        companyId: row.companyId,
        candidateId: row.candidateId,
        evidenceId: row.evidenceId,
        claimType:
          row.claimType === CandidateClaimType.SKILL
            ? "SKILL"
            : row.claimType === CandidateClaimType.LOCATION
              ? "LOCATION"
              : row.claimType === CandidateClaimType.EMPLOYER
                ? "EMPLOYER"
                : "JOB_TITLE",
        normalizedValue: row.normalizedValue,
        sourceSpanStart: row.sourceSpanStart,
        sourceSpanEnd: row.sourceSpanEnd,
      })),
      requirements: (intel?.requirements ?? []).map((row) => ({
        requirementId: row.id,
        companyId: row.companyId,
        jobSpecificationVersionId: row.jobSpecificationVersionId,
        skillConceptId: row.skillConceptId,
        skillCanonicalKey: row.normalizedValue,
      })),
      skills: skills.map((row) => ({
        skillConceptId: row.id,
        canonicalKey: row.canonicalKey,
        ontologyVersion: row.ontologyVersion,
      })),
      assessments: (matcher?.assessments ?? []).map((row) => ({
        assessmentId: row.id,
        companyId: row.companyId,
        jobRequirementId: row.jobRequirementId,
        claimId: row.claimId,
        evidenceId: row.evidenceId,
        supportState: row.supportState,
      })),
      profileSkills: null,
    });

    const key: EvidenceGraphIdempotencyKey = {
      companyId,
      applicationId: application.id,
      jobSpecificationVersionId: spec.id,
      jobIntelligenceRunId: intel?.id ?? null,
      matcherV2RunId: matcher?.id ?? null,
      graphVersion: EVIDENCE_GRAPH_VERSION,
      ontologyVersion: ONTOLOGY_VERSION,
      matcherVersion: matcher?.matcherVersion ?? null,
      sourceSnapshotHash: hashEvidenceGraphSnapshot({
        evidenceIds: evidence.map((row) => row.evidenceId),
        claimIds: claims.map((row) => row.id),
        requirementIds: (intel?.requirements ?? []).map((row) => row.id),
        assessmentIds: (matcher?.assessments ?? []).map((row) => row.id),
        skillIds: skills.map((row) => row.id),
      }),
    };

    const existing = await findCompletedEvidenceGraphRun(key);
    if (existing) {
      stored.push(toSafeEvidenceGraphRun(existing, evidence));
      continue;
    }

    const running = await findLatestRunningEvidenceGraphRun(key);
    if (running) {
      if (Date.now() - running.createdAt.getTime() < STALE_EVIDENCE_GRAPH_RUNNING_MS) {
        throw new EvidenceGraphError(
          "Evidence graph materialization is already running.",
          EVIDENCE_GRAPH_IN_PROGRESS,
        );
      }
      await markEvidenceGraphRunFailed(
        running.id,
        running.companyId,
        EVIDENCE_GRAPH_INTERNAL_ERROR,
      );
    }

    const run = await createEvidenceGraphRun({
      ...key,
      jobId: input.jobId,
      candidateId: application.candidateId,
    });
    try {
      const completed = await prisma.$transaction(async (tx) => {
        const raced = await findCompletedEvidenceGraphRun(key, tx);
        if (raced) {
          await markEvidenceGraphRunFailed(
            run.id,
            key.companyId,
            EVIDENCE_GRAPH_INTERNAL_ERROR,
            tx,
          );
          return raced;
        }
        await createEvidenceGraphEdges(
          { companyId: key.companyId, runId: run.id, edges: drafts },
          tx,
        );
        const updated = await markEvidenceGraphRunCompleted(
          run.id,
          key.companyId,
          tx,
        );
        if (updated.count !== 1) {
          throw new EvidenceGraphError(
            EVIDENCE_GRAPH_GENERIC_ERROR,
            EVIDENCE_GRAPH_INTERNAL_ERROR,
          );
        }
        const saved = await getEvidenceGraphRunWithEdges(run.id, key.companyId, tx);
        if (!saved) {
          throw new EvidenceGraphError(
            EVIDENCE_GRAPH_GENERIC_ERROR,
            EVIDENCE_GRAPH_INTERNAL_ERROR,
          );
        }
        return saved;
      });
      stored.push(toSafeEvidenceGraphRun(completed, evidence));
    } catch (error) {
      await markEvidenceGraphRunFailed(
        run.id,
        key.companyId,
        error instanceof EvidenceGraphError
          ? error.code
          : EVIDENCE_GRAPH_INTERNAL_ERROR,
      );
      if (error instanceof EvidenceGraphError) {
        throw error;
      }
      throw new EvidenceGraphError(
        EVIDENCE_GRAPH_GENERIC_ERROR,
        EVIDENCE_GRAPH_INTERNAL_ERROR,
      );
    }
  }

  return stored;
}

export async function loadEvidenceGraphPage(
  jobId: number,
): Promise<EvidenceGraphPageData> {
  const job = await prisma.job.findFirst({
    where: { id: jobId },
    select: { id: true, companyId: true },
  });
  if (!job) {
    notFound();
  }
  const [specs, runs] = await Promise.all([
    listPublishedSpecsForJob(job.id, job.companyId),
    listEvidenceGraphRunsForJob(job.id, job.companyId),
  ]);
  const candidateIds = [...new Set(runs.map((run) => run.candidateId))];
  const evidenceRows =
    candidateIds.length === 0
      ? []
      : await prisma.candidateEvidence.findMany({
          where: { companyId: job.companyId, candidateId: { in: candidateIds } },
          select: {
            id: true,
            candidateId: true,
            revokedAt: true,
            supersededById: true,
          },
        });
  const evidenceByCandidate = new Map<
    number,
    Array<{ evidenceId: number; revokedAt: Date | null; supersededById: number | null }>
  >();
  for (const row of evidenceRows) {
    const list = evidenceByCandidate.get(row.candidateId) ?? [];
    list.push({
      evidenceId: row.id,
      revokedAt: row.revokedAt,
      supersededById: row.supersededById,
    });
    evidenceByCandidate.set(row.candidateId, list);
  }
  return {
    jobId: job.id,
    publishedSpecs: specs,
    runs: runs.map((run) =>
      toSafeEvidenceGraphRun(run, evidenceByCandidate.get(run.candidateId) ?? []),
    ),
  };
}
