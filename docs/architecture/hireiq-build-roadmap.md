# HireIQ build roadmap

**Document state:** PLANNED implementation sequence. This file describes intended
milestones. It does not claim that future tables or APIs already exist.

**Label key:** IMPLEMENTED | PARTIALLY IMPLEMENTED | PLANNED | NOT IMPLEMENTED

See [hireiq-engineering-constitution.md](./hireiq-engineering-constitution.md)
for product and engineering rules.

Funnel sizes (~1,500 → ~300 → ~80 → ~25) are hypotheses, not product constants.

## Already in the repository

| Area | State |
| --- | --- |
| Tenanted hiring OS (Company, Job, Application, portals) | IMPLEMENTED |
| JobSpecificationVersion (published immutable) | IMPLEMENTED |
| CandidateEvidence (append-only) | IMPLEMENTED |
| T92 Candidate Intelligence (OpenAI, `COVER_LETTER_CLAIMS`) | IMPLEMENTED |
| T93 Matcher V1 (`SATISFIED` / `UNKNOWN` / `UNSUPPORTED`) | IMPLEMENTED |
| T94 Evidence coverage ranking (`satisfiedSkillCount`) | IMPLEMENTED |
| Decision-support labeled cards | PARTIALLY IMPLEMENTED |
| Job Intelligence / Requirement Graph / Skill aliases | IMPLEMENTED (M1–M3, V1) |
| Deterministic candidate extraction / Matcher V2 | IMPLEMENTED (M4–M5, V1) |
| Why / Gap / Uncertainty desk | IMPLEMENTED (M6) |
| Benchmark / regression fixtures | IMPLEMENTED (M7 unit suite) |
| Lexical retrieval baseline | IMPLEMENTED (M8) |
| Semantic retrieval baseline | IMPLEMENTED (M9) |
| Live embedding evaluation gate | IMPLEMENTED (M9.1, latest run NOT_RUN) |
| Hybrid retrieval, rerank, LTR, gold warehouse | NOT IMPLEMENTED |

V1 `CandidateMatchResult` must not be renamed or reinterpreted.

## Milestone sequence

| ID | Milestone | State target |
| --- | --- | --- |
| M0 | Persist constitution + this roadmap | IMPLEMENTED |
| M1 | Deterministic Job Intelligence V1 | IMPLEMENTED |
| M2 | Requirement Graph V1 (nodes, no unused edges) | IMPLEMENTED |
| M3 | Versioned skill aliases (React ≠ React Native) | IMPLEMENTED |
| M4 | Deterministic candidate extraction + negation | IMPLEMENTED |
| M5 | Matcher V2 on a new versioned table | IMPLEMENTED |
| M6 | Admin Why / Gap / Uncertainty / Evidence | IMPLEMENTED |
| M7 | Benchmark + regression suite | IMPLEMENTED |
| M8 | Lexical retrieval baseline | IMPLEMENTED |
| M9 | Semantic retrieval baseline | IMPLEMENTED |
| M9.1 | Live `text-embedding-3-small` evaluation gate | IMPLEMENTED (status NOT_RUN until a key is configured) |
| M10+ | Hybrid retrieval | only after a COMPLETED live embedding measurement |
| M11+ | Evidence-aware reranking | only after measurable retrieval |
| M12+ | Recruiter feedback events | later |
| M13+ | Outcomes / evaluation pipeline | later |
| M14+ | Learning-to-rank research | later |

## Definition of Done (every milestone)

Implementation exists; tests include a negative case; tenant isolation and
Admin authorization are covered for new endpoints; migrations are additive;
typecheck, lint, and relevant tests actually ran; git diff is reviewed; the
report states implemented / verified / not verified / limitations / next
milestone.

M0 extra: diff is documentation only (plus this folder).

M5 extra: V1 match rows and `CandidateMatchResult` remain unchanged.

M6 extra: Matcher V2 does not write `Application.status`.
