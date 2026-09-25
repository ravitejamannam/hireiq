# Candidate Evidence Graph V1

**State:** IMPLEMENTED

`M10_IMPLEMENTED = NO`

This is a tenant-scoped, provenance-preserving projection of existing
HireIQ facts. It is an evidence structure, not a ranking system.

## 1. Problem

M0–M9 already store evidence, claims, requirement-graph nodes, Matcher V2
assessments, and citations. Those links existed as foreign keys, but there
was no explicit, versioned, auditable graph a reviewer could inspect without
collapsing Matcher V2, T94, M8, and M9 into one generic score.

Phase 5 materializes only relationships the repository already supports.

## 2. Existing entities reused

The graph does not duplicate these records. It points at them:

- `CandidateEvidence` (source of truth; revoke / supersede remain on evidence)
- `CandidateClaim` (deterministic intelligence claims, including source spans)
- `JobRequirement` (Requirement Graph V1 nodes from Job Intelligence)
- `SkillConcept` (alias ontology; related technologies remain distinct)
- `RequirementAssessment` / `RequirementAssessmentRun` (Matcher V2 citations)
- `JobSpecificationVersion` (published spec the snapshot is pinned to)

Not participants:

- `CandidateProfile` / `Candidate.skills` / candidate metadata
- M8 `LexicalRetrievalResult`
- M9 `SemanticRetrievalResult` / `RetrievalEmbedding`
- T94 `JobRankingResult`
- Application status

## 3. Graph V1 entities

- `EvidenceGraphRun` — per-application snapshot for one company, job, published
  spec, optional Job Intelligence run, and optional Matcher V2 run.
- `EvidenceGraphEdge` — immutable historical edge inside that snapshot.

Node types are labels on edges, not copied node tables:
`EVIDENCE`, `CLAIM`, `REQUIREMENT`, `SKILL`, `ASSESSMENT`.

## 4. Graph V1 relationship types

Only FK-backed edges are materialized.

| Type | Source | Destination | Provenance | Version | Deterministic | Derived | Can stale | Own revoke |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `EVIDENCE_SUPPORTS_CLAIM` | Evidence | Claim | `CandidateClaim.evidenceId` | claim/evidence ids | yes | projection | yes, if evidence revoked/superseded | no |
| `CLAIM_MAPS_TO_SKILL` | Claim | Skill | SKILL `normalizedValue` in the pinned ontology version | ontology version | yes | projection | yes, if ontology version changes | no |
| `REQUIREMENT_REQUIRES_SKILL` | Requirement | Skill | `JobRequirement.skillConceptId` | spec + ontology | yes | projection | yes, if a new spec/intel run is used | no |
| `CLAIM_CITED_FOR_REQUIREMENT` | Claim | Requirement | Matcher V2 `claimId` + `jobRequirementId` | spec + ontology + matcher version | yes | projection | yes, if a newer Matcher V2 run exists | no |
| `ASSESSMENT_CITES_EVIDENCE` | Assessment | Evidence | Matcher V2 `evidenceId` | spec | yes | projection | same | no |
| `ASSESSMENT_CITES_CLAIM` | Assessment | Claim | Matcher V2 `claimId` | spec | yes | projection | same | no |

`CLAIM_ADDRESSES` is not invented. A claim addresses a requirement only when
Matcher V2 already cited that claim.

Tenant is `companyId` on every run and edge.

## 5. Provenance model

Every derived edge stores:

- `provenance` string pointing at the source FK
- `sourceEvidenceId` / `sourceClaimId` / `sourceRequirementId` / `sourceAssessmentId` when applicable

Existing `CandidateClaim.sourceSpanStart` / `sourceSpanEnd` remain on the
claim. Graph rows do not copy resume text or document blobs.

## 6. Tenant model

Every load and write is company-scoped.

- Source loaders require `companyId`.
- Engine drops rows whose `companyId` does not match the run.
- Cross-tenant IDs never become edges.
- Queries never search “all claims matching X” without a company filter.

## 7. Versioning

A snapshot is pinned to:

- `graphVersion` = `v1-candidate-evidence-graph`
- `ontologyVersion`
- `jobSpecificationVersionId`
- optional `jobIntelligenceRunId`
- optional `matcherV2RunId` / `matcherVersion`
- `sourceSnapshotHash` of participating ids

A new spec, ontology, intelligence run, or Matcher V2 run creates a new
snapshot. Historical snapshots are not rewritten.

## 8. Revocation / supersession

**Lifecycle A:** edges are immutable historical relationships. Validity of
evidence is interpreted at read time from `CandidateEvidence.revokedAt` and
`supersededById`.

Revoked or superseded evidence still produces historical
`EVIDENCE_SUPPORTS_CLAIM` edges. The diagnostic surface marks
`evidenceActive = false`. Inactive evidence is not treated as current proof.

Edges do not have their own revoke column.

## 9. Idempotency

Construction is deterministic. The same source set produces the same edge
identity (`companyId`, `runId`, `edgeType`, endpoints).

Completed runs are unique on the idempotency key (partial unique index with
`COALESCE` for nullable intel/matcher versions). Re-running the same
materialization returns the existing snapshot.

## 10. Lifecycle

1. Admin selects a published specification.
2. Service loads tenant-scoped applications, evidence (including historical),
   claims, Job Intelligence requirements, ontology skills, and the latest
   completed Matcher V2 run for that spec.
3. Engine projects edges.
4. A `RUNNING` run is stored, edges written, then marked `COMPLETED`.
5. Read path annotates evidence activity. It does not score candidates.

## 11. Query boundaries

Allowed: company + job / application / candidate / run.

Forbidden: global claim search, cross-tenant graph walk, using the graph as a
retrieval index, or treating edge counts as quality.

## 12. Non-goals

- M10 hybrid retrieval
- RRF, score fusion, reranking, BM25
- embeddings or another embedding provider
- `candidateScore`
- application status writes
- automatic hiring decisions
- profile-to-evidence laundering
- renaming `SATISFIED` / `UNKNOWN` / `UNSUPPORTED`
- changing Matcher V2, M8, or M9 semantics
- a large graph visualization
- aggregate candidate quality

## 13. Known limitations

- Relationships are a FK projection. Missing citations cannot be inferred.
- Optional `jobIntelligenceRunId` / `matcherV2RunId` are stored as integers
  without Prisma relations because those FKs are nullable and already
  company-scoped at the service boundary.
- Ontology is still alias-based. `CLAIM_MAPS_TO_SKILL` is exact canonical-key
  match inside one ontology version.
- No quality, recency, or corroboration scoring.
- M9.1 live embedding evaluation remains `NOT_RUN`.
- Service-layer tenant tests go through the engine and company-scoped
  repository signatures. Full database multi-tenant fixtures are not part of
  the unit suite.

## 14. Future extensions

Later phases may add quality/recency/corroboration, richer requirement-graph
edges, or a read model for investigation. Those must remain distinct from
retrieval and ranking.

## 15. Relationship to Matcher V2

Matcher V2 remains the requirement-assessment engine
(`SUPPORTED` / `PARTIALLY_SUPPORTED` / `UNKNOWN` / `CONTRADICTED` /
`UNSUPPORTED`). The graph only copies citations that V2 already stored.
UNKNOWN stays distinct from false. The graph does not rename V1
`SATISFIED` / `UNKNOWN` / `UNSUPPORTED`.

## 16. Relationship to M8

M8 lexical retrieval is unchanged. Graph edges are not lexical scores and are
not used to retrieve applications.

## 17. Relationship to M9

M9 semantic retrieval is unchanged. The graph does not read or write
embeddings.

## 18. Why this is not a ranking system

- No rank field
- No `candidateScore`
- No cohort ordering
- No fusion with T94 / M8 / M9
- Edge counts are not a quality metric
- The admin surface is a diagnostic list of evidence, claims, relationships,
  requirements, and provenance

`M10_IMPLEMENTED = NO`
