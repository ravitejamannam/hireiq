# Next-milestone architecture audit

STATUS: DESIGN_ONLY  
IMPLEMENTED = NO  
M9_LIVE_STATUS: NOT_RUN  
M10_IMPLEMENTATION: NOT_APPROVED

Inspected against `hireiq-engineering-constitution.md`,
`hireiq-build-roadmap.md`, Prisma models, services, actions, tests, and Admin
UI. Findings are labeled VERIFIED, PARTIAL, MISSING, or UNKNOWN. Gaps are not
filled in.

This document does not authorize implementation.

---

## 1. Current architecture map

Verified layers in the repository today:

```
Company / User / OrganizationMember          IDENTITY + TENANCY
Job + JobSpecificationVersion                JOB (published versions immutable)
Application                                  HIRING UNIT
Candidate + CandidateProfile + CompanyPerson IDENTITY / PROFILE
CandidateEvidence (append-only)              EVIDENCE
CandidateResumeDocument / object storage     RAW DOCUMENT
T92 OpenAI claims  +  M4 deterministic claims INTELLIGENCE (two paths)
SkillConcept + SkillAlias (ALIAS only)       ONTOLOGY V1
JobIntelligenceRun + JobRequirement nodes    JOB INTEL + REQUIREMENT GRAPH V1
RequirementMatch (V1 SATISFIED|UNKNOWN|UNSUPPORTED)
RequirementAssessment (V2 richer states)     MATCHING (two versions)
JobRankingRun (V1 satisfiedSkillCount)       COVERAGE RANKING
LexicalRetrievalRun                          M8 RETRIEVAL
SemanticRetrievalRun + RetrievalEmbedding    M9 RETRIEVAL
Assessment / Interview / Evaluation / Offer  DOWNSTREAM HIRING OS
DecisionSupport labeled cards                PARTIAL DECISION SUPPORT
```

Not present (VERIFIED missing):

```
Skill / evidence / requirement graph edges
Evidence quality / recency / corroboration models
Hybrid retrieval, rerank, LTR
Recruiter feedback / pairwise preference events
Outcomes warehouse / recruiter gold protocol
BM25 index
pgvector
candidateScore
```

Product lifecycle from constitution §1 vs code:

| Stage | State |
| --- | --- |
| Job / spec / distribution / apply | VERIFIED |
| Application / assessment / interview / coding test / report | VERIFIED |
| Evidence | VERIFIED (append-only, revoke/supersede) |
| Candidate intelligence | PARTIAL (T92 OpenAI + M4 deterministic; not unified) |
| Job understanding | PARTIAL (deterministic spec extraction; JD heuristics) |
| Retrieval | PARTIAL (M8 frozen; M9 frozen; live M9 NOT_RUN; no hybrid) |
| Matching | VERIFIED V1 + V2, separate tables |
| Reranking | MISSING |
| Evidence explanation | PARTIAL (M6 V2 desk; V1 ranking still shown) |
| Human review / shortlist / hire / billing | VERIFIED hiring OS |
| Outcomes / learning | MISSING |

---

## 2. Completed milestones

| ID | Claim | State | Evidence |
| --- | --- | --- | --- |
| M0 | Constitution + roadmap | VERIFIED | `docs/architecture/hireiq-engineering-constitution.md`, `hireiq-build-roadmap.md` |
| M1 | Deterministic Job Intelligence V1 | VERIFIED | `JobIntelligenceRun`, `lib/jobs/intelligence/*`, tests |
| M2 | Requirement Graph V1 nodes | VERIFIED | `JobRequirement` nodes, pinned to spec + intel run. Edges intentionally unused |
| M3 | Versioned skill aliases | VERIFIED | `SkillConcept`, `SkillAlias`, `relationshipType = ALIAS` only, React ≠ React Native tests |
| M4 | Deterministic extraction + negation | VERIFIED | `deterministic-extractor.ts`, polarity POSITIVE/NEGATED |
| M5 | Matcher V2 | VERIFIED | `RequirementAssessment` + `SUPPORTED\|PARTIALLY_SUPPORTED\|UNKNOWN\|CONTRADICTED\|UNSUPPORTED`. V1 enum unchanged |
| M6 | Why / Gap / Uncertainty desk | VERIFIED service + `RequirementExplanationPanel` |
| M7 | Benchmark / regression fixtures | VERIFIED unit suite `lib/evaluation/benchmarks/benchmark.test.ts` |
| M8 | Lexical retrieval baseline | VERIFIED frozen `v1-lexical-term-overlap` |
| M9 | Semantic retrieval baseline | VERIFIED frozen `v1-semantic-embedding` |
| Hiring OS | Tenanted ATS around the above | VERIFIED Company/Job/Application/portals |
| T93 | Matcher V1 | VERIFIED `RequirementMatch` + SATISFIED/UNKNOWN/UNSUPPORTED |
| T94 | Evidence-coverage ranking | VERIFIED `satisfiedSkillCount`, not ML |

M5 extra: V1 match rows were not renamed. VERIFIED.  
M6 extra: Matcher V2 does not write `Application.status`. VERIFIED (no status imports in matching/retrieval libs).

---

## 3. Partial milestones

| Area | State | What exists | What does not |
| --- | --- | --- | --- |
| M9.1 live embedding gate | PARTIAL | Gate code + fail-closed tests | Live `text-embedding-3-small` run. Status **NOT_RUN** |
| Decision-support cards (roadmap) | PARTIAL | `decision-support-service.ts` labeled signals: expert score, assessment, V1 matching, evaluation, interview, coding test, report | Does **not** include Matcher V2, M8, or M9. Candidate-scoped, not application-contextual for retrieval |
| Job Intelligence UX | PARTIAL | Service + server action | **No Admin panel** on the requirement desk. Runs only as a side effect of V2/retrieval |
| Requirement Graph | PARTIAL | Nodes + provenance + categories + uncertainty | No requirement–requirement edges. No importance beyond REQUIRED/PREFERRED |
| Skill ontology | PARTIAL | Canonical + aliases, versioned | No RELATED/PARENT edges. Catalog is small and curated. `SkillAliasRelationshipType` is `ALIAS` only |
| Candidate evidence graph (constitution phase 5) | PARTIAL | Evidence, claims, assessments, skill FKs exist as tables | No first-class graph, corroboration, recency, or evidence-strength model |
| Candidate intelligence | PARTIAL | T92 OpenAI `COVER_LETTER_CLAIMS` and M4 deterministic | Two extractors; T92 still defaults polarity POSITIVE historically |
| Retrieval product | PARTIAL | Two Admin panels | Not wired into decision support; UI browser verification UNKNOWN |
| Evaluation | PARTIAL | Synthetic unit metrics, frozen 5-case set, offline hash-projection compare | No recruiter protocol, no gold warehouse, live M9 absent |
| Explainability | PARTIAL | V2 why/gap; lexical matchedTerms; semantic supportingEvidenceId | No “why ranked above another”; V1 ranking still looks like discovery |
| Assessments as evidence | PARTIAL | Assessment models + leaderboard | Not represented as `CandidateEvidence`; constitution says do not merge into coverage ranking |
| Resume pipeline | PARTIAL | Object storage drivers, text extraction | Whether every resume becomes eligible evidence automatically is UNKNOWN without a full apply-path audit |
| Observability | PARTIAL | `SENTRY_DSN` in `.env.example` | Retrieval/intelligence latency and cost are not first-class run fields except M9.1 usage on live eval |

---

## 4. Missing milestones

| ID / constitution phase | State |
| --- | --- |
| M10 Hybrid retrieval | MISSING. Design-only doc exists. **NOT_APPROVED** |
| M11 Evidence-aware reranking | MISSING |
| M12 Recruiter feedback events | MISSING. No feedback/preference model |
| M13 Outcomes / evaluation pipeline / gold warehouse | MISSING |
| M14 Learning-to-rank | MISSING |
| Constitution §10 Skill Graph (related ≠ equivalent) | MISSING |
| Constitution §12 Evidence quality dimensions | MISSING |
| Constitution §16 Corroboration counts | MISSING |
| Constitution §17 Recency / decay | MISSING |
| Constitution §21 BM25 baseline | MISSING (M8 is term-overlap, not BM25) |
| Hybrid indexes / pgvector | MISSING (intentional for M9) |
| Recruiter gold annotation protocol | MISSING |
| Multilingual retrieval | MISSING (constitution: do not implement prematurely) |

---

## 5. Engineering debt discovered

These are meaningful. They should be reduced before another **retrieval** subsystem (hybrid, BM25, rerank). They do not all block an evidence-graph milestone.

| Debt | State | Why it matters |
| --- | --- | --- |
| M8/M9/M5 **service** tenant/auth tests | PARTIAL | Engine unit tests exist. Services import `next-auth` and are not imported by tests. Isolation is implemented in queries; regression coverage is thinner than the engines |
| Repo-wide ESLint | PARTIAL | Pre-existing errors in `ProfileLivePreview` / `SocialsEditor`. M9 files were lint-clean when last checked. UNKNOWN whether CI fails on them |
| Retrieval Admin UI | UNKNOWN | Panels exist. Browser verification was not run in M9/M9.1 |
| Job Intelligence has no desk UI | VERIFIED gap | Recruiters cannot inspect the requirement graph except through V2/retrieval side effects |
| Three “ranking” surfaces | VERIFIED | T94 `satisfiedSkillCount`, M8 lexical overlap, M9 cosine sit on one page without a shared explanation of layer roles |
| Decision support ignores V2/M8/M9 | VERIFIED | Constitution §27–28 is only partly met |
| Dual intelligence extractors | VERIFIED | T92 OpenAI vs M4 deterministic can disagree; matching/retrieval use deterministic claims for V2/M8 |
| M9 no similarity floor | VERIFIED | Any evidence vector can rank. Not a bug to “fix” for hybrid; it is an experimental fact |
| Official eval set size = 5 | VERIFIED | Too small to tune fusion or declare retrieval winners |
| No BM25 | VERIFIED | Constitution listed it as a baseline; M8 is a different lexical method and is frozen |
| Lint/type/test last-run status for this audit | UNKNOWN | This audit did not re-run the suite |

Hardening before **another major retrieval/intelligence subsystem** (M10/M11/new embedder/BM25 index): **YES, recommended.**

Hardening before **constitution Phase 5 evidence graph** (additive, no OpenAI, no M8/M9 edits): **slice 0 tests/UX honesty, then graph.** Do not wait for OpenAI.

---

## 6. Security / tenant-isolation risks

| Risk | State | Notes |
| --- | --- | --- |
| Composite `companyId` FKs on intelligence/retrieval | VERIFIED | Runs and results use `(id, companyId)` |
| Repository queries filter `companyId` | VERIFIED for M8/M9 loaders | Semantic embeddings listed by company; mismatch fails the run |
| Admin-only retrieval/matching | VERIFIED | `requireAdmin` + role check; forbidden browser fields rejected |
| Service-level isolation tests | PARTIAL | Engine tests drop other-company rows; HTTP/action tests MISSING |
| Decision support `skipAdmin` option | VERIFIED exists | Caller can skip admin if they pass `companyId`. Whether all callers are safe is UNKNOWN without a full call-graph audit |
| Vector global search | MISSING (good) | No pgvector; no global ANN |
| External embedding PII | PARTIAL | Redaction of email/phone exists; live send to OpenAI happens only when configured. Live eval NOT_RUN |
| Client-supplied `companyId` | VERIFIED rejected on retrieval/intel validation | Server derives tenant from job/spec |

No cross-tenant leakage was demonstrated in this audit. Engine tests cover corpus filtering. End-to-end action leakage is UNKNOWN.

---

## 7. Data-integrity risks

| Risk | State |
| --- | --- |
| Published spec immutability | VERIFIED model + services require PUBLISHED |
| Evidence append-only + revoke/supersede | VERIFIED |
| Eligibility reused by M8/M9/V2 | VERIFIED `revokedAt` / `supersededById` |
| V1 vs V2 match tables | VERIFIED separate; V1 enum frozen |
| Historical retrieval runs | VERIFIED version fields + hashes |
| Job Intelligence nodes historically pinned | VERIFIED `runId` + spec id |
| Requirement edges | MISSING by design in M2 |
| Related-skill edges | MISSING — cannot currently represent “related but not equivalent” except by *not* aliasing |
| T92 historical claims default POSITIVE | VERIFIED schema comment — negation may be absent on old OpenAI rows |
| Dual ranking numbers on one job | VERIFIED product-integrity risk: recruiter may treat `satisfiedSkillCount` as retrieval or quality |
| Application status from retrieval | VERIFIED not written |
| `candidateScore` | VERIFIED absent as a retrieval/matching field |

---

## 8. Evaluation gaps

| Gap | State |
| --- | --- |
| Frozen dataset `m8-frozen-v1` | VERIFIED 5 cases, `SYNTHETIC_NOT_RECRUITER_OUTCOMES` |
| Metrics helpers Recall/Precision/MRR/NDCG | VERIFIED |
| Offline hash-projection M8 vs M9 | VERIFIED; **not** production evidence |
| Live `text-embedding-3-small` | NOT_RUN |
| Recruiter judgment protocol | MISSING |
| Gold warehouse | MISSING |
| Official cases for Django-as-Python, Java/JS, Postgres/MySQL, stuffing, verbose | MISSING from official set; diagnostic-only in M9.1 |
| Historical hiring outcomes as labels | MISSING (correct; constitution forbids treating them as perfect truth) |
| Latency/cost at 1,500 applications | UNKNOWN |
| Evaluation reproducibility of M8 | VERIFIED deterministic |
| Evaluation reproducibility of live M9 | UNKNOWN until COMPLETED |

---

## 9. Recommended next milestone

**Candidate Evidence Graph V1** — constitution research roadmap Phase 5.

Not M10. Not M11. Not a new embedding provider. Not BM25-as-M8-replacement.

Constitution §66 order:

> Reliable evidence → Job intelligence → Skill ontology → Requirement graph →
> **Candidate evidence graph** → Hybrid retrieval → …

Phases 1–4 exist at V1. Phase 5 is the first remaining **research** phase that
the roadmap does not block on a live OpenAI key.

Roadmap M10+ is explicitly “only after a COMPLETED live embedding measurement.”
That measurement is NOT_RUN. Selecting M10 now would violate the roadmap.

### Why this, not intuition

| Alternative | Why not now |
| --- | --- |
| M10 hybrid | NOT_APPROVED; live M9 unknown; score scales incompatible |
| M11 rerank | Depends on measurable retrieval |
| M12 recruiter feedback | Constitution phase 9; no feedback model; retrieval UX still experimental |
| M13 gold warehouse | High scientific value, but without a human protocol it becomes more synthetic cases — forbidden if used to favor a method |
| BM25 retrieval | Constitution listed it; M8 is already the frozen lexical baseline. A third retriever before an evidence graph adds retrieval complexity the constitution sequences later |
| “Just harden forever” | Necessary preamble, not a constitution phase. Should be slice 0 of the next milestone, not a substitute for Phase 5 |

---

## 10. Why it can proceed without a live embedding API

Evidence Graph V1 would use objects that already exist without OpenAI:

- `CandidateEvidence`
- deterministic `CandidateClaim` (M4)
- `JobRequirement` nodes (M1–M2)
- `SkillConcept` / `SkillAlias` (M3)
- `RequirementAssessment` citations (M5)

It does not need `RetrievalEmbedding`, `OPENAI_API_KEY`, or M9.1 COMPLETED.

M8 and M9 stay frozen consumers of evidence text. The graph must not change
their scoring semantics.

T92 OpenAI extraction remains optional. The graph should attach to evidence and
deterministic claims first.

---

## 11. Explicit non-goals

- Implement M10 hybrid, RRF, or score fusion
- Modify M8 or M9 semantics, K, eligibility, or query construction
- Modify Matcher V2 states or V1 `SATISFIED`/`UNKNOWN`/`UNSUPPORTED`
- Modify Job Intelligence extraction semantics
- Treat related skills as aliases or equivalences
- Add `candidateScore`
- Write `Application.status` from graph or retrieval
- Add reranking, LTR, or recruiter-trained weights
- Add a new embedding provider or pgvector
- Enlarge the official retrieval benchmark to make any method look better
- Call hash-projection or a future graph score “production retrieval quality”
- Run `prisma migrate reset` or discard existing work

---

## 12. Dependencies

**Required to start Phase 5 (already present):**

- Append-only evidence with revoke/supersede — VERIFIED
- Deterministic claims with polarity and spans — VERIFIED
- Versioned skill concepts — VERIFIED
- Requirement nodes with source provenance — VERIFIED
- Matcher V2 citations to claim/evidence — VERIFIED

**Required as slice 0 (hardening, no new product layer):**

- Service-level Admin/tenant tests for M5/M8 (and M9 without calling OpenAI)
- Decision-support cards that *display* V2/M8/M9 as labeled layers, without fusing scores
- Job Intelligence inspectability on the Admin desk
- Clear UI copy that T94 ranking ≠ retrieval ≠ matching ≠ hire

**Not required:**

- `OPENAI_API_KEY`
- M9.1 COMPLETED
- Recruiter gold labels
- Hybrid design approval

**Later dependents (do not pull them in):**

- Hybrid retrieval (needs live M9 + this graph, in that spirit)
- Rerank / LTR / feedback

---

## 13. Definition of Done (when Phase 5 is later implemented)

A future implementation prompt should require:

- Additive models only; no edits to M8/M9/V1/V2 scoring
- Explicit version (`evidenceGraphVersion`)
- Links are not equivalence and not a hire score
- Corroboration/recency/quality stored as dimensions, not a magic total
- Tenant isolation + Admin authorization tested at the service
- Negative tests: related ≠ equivalent; revoked evidence excluded; cross-tenant denied
- Existing M0–M9.1 tests still pass
- Prisma validate, TypeScript, lint on touched files, `git diff --check`
- Docs state SYNTHETIC labels remain synthetic
- No application status writes
- Browser verification if Admin UI changed

This audit does **not** start that work.

---

## 14. Risks

| Risk | If ignored |
| --- | --- |
| Starting M10 now | Unmeasured semantic false positives baked into fusion |
| Building a graph that Matcher V2 or M8 silently consume | Frozen semantics broken |
| Encoding RELATED as ALIAS | React Native becomes React |
| Scoring the graph | Becomes `candidateScore` under another name |
| Expanding synthetic gold to “need more cases” | Benchmark manipulation |
| Skipping hardening | Another Admin panel recruiters cannot distinguish from ranking |
| Waiting indefinitely for OpenAI | Phase 5 and hiring-OS integrity stall for a key |

---

## 15. GO / NO-GO criteria

### GO for *designing/implementing* Candidate Evidence Graph V1

All of the following:

1. M8, M9, Matcher V2, Job Intelligence, eligibility, and the frozen dataset remain unmodified.
2. No hybrid/rerank/embedding work is bundled.
3. No live OpenAI dependency in the happy path.
4. Slice 0 includes tenant/auth tests and layer-honesty UX (V2/M8/M9/T94 labeled separately).
5. Graph edges never imply skill equivalence.
6. No `candidateScore` and no status writes.

### NO-GO

1. Treating this audit as an implementation approval for M10–M14.
2. Using `LIVE_PRODUCTION_EMBEDDING_NOT_RUN` as if M9 beat or lost to M8.
3. Using hash-projection numbers as production retrieval evidence.
4. Changing frozen evaluation cases to prepare for a graph or hybrid.
5. Implementing BM25, hybrid, or rerank “while we are in there.”

### Current decision

| Question | Decision |
| --- | --- |
| Implement M10? | NO-GO |
| Implement new AI/embeddings? | NO-GO |
| Recommended next milestone? | **Candidate Evidence Graph V1** (constitution Phase 5), with hardening slice 0 |
| Start coding in this audit? | NO |

---

## Layer honesty (for the next implementer)

On one requirement today a recruiter can see:

1. T94 coverage rank (`satisfiedSkillCount` from Matcher V1)
2. Matcher V2 requirement support
3. M8 lexical overlap
4. M9 semantic similarity (if embeddings configured)

These answer different questions. None is “who to hire.”

---

## Commands and tests

This audit did not run the test suite, typecheck, lint, or migrate.
Last known suite status from prior work (not re-verified here): UNKNOWN for
this session.
