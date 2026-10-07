# Hybrid retrieval design audit (M10)

STATUS: DESIGN_ONLY

- M9_LIVE_STATUS: COMPLETED
- M9_LIVE_MODEL: openai:text-embedding-3-small
- M9_LIVE_EVALUATION: m8-frozen-v1
- M9_LIVE_COMPLEMENTARITY: NOT DEMONSTRATED
- M10_RESEARCH_DECISION: CONDITIONAL-GO
- M10_EXPERIMENT: REGISTERED
- M10_IMPLEMENTATION: IMPLEMENTED
- M10_IMPLEMENTATION_AUTHORIZED: YES for the registered RRF experiment only
- M10_EVALUATION: COMPLETED on m8-frozen-v1 (see Official frozen experiment result)

This document is an evidence-based design audit. It does not authorize
implementation. It does not claim that M9 is better than M8.

The audit below was written before the live gate ran. At that time the only
supported live statement was `LIVE_PRODUCTION_EMBEDDING_NOT_RUN`. That
historical text is preserved. The live record is
`docs/architecture/live-embedding-evaluation.md`, recorded
`2026-10-07T07:32:27.531Z`.

Offline `hash-projection-v1` results remain

`SYNTHETIC_NOT_RECRUITER_OUTCOMES`

and are not evidence about `text-embedding-3-small`.

---

## 1. Verified repository findings

Inspected in this audit. Anything not found is marked UNKNOWN.

| Claim | Evidence |
| --- | --- |
| M8 implemented | `lib/retrieval/lexical-engine.ts`, `lexical-retrieval-service.ts`, `LexicalRetrievalRun` |
| M9 implemented | `lib/retrieval/semantic-engine.ts`, `semantic-retrieval-service.ts`, `SemanticRetrievalRun`, `RetrievalEmbedding` |
| M9.1 gate implemented | `lib/evaluation/live-embedding-evaluation.ts`, `pnpm eval:live-embeddings` |
| Latest live gate status | `docs/architecture/live-embedding-evaluation.md` records **NOT_RUN** at `2026-09-25T15:36:59.885Z` |
| Hybrid retrieval code | **NOT PRESENT.** No `HybridRetrieval*` model, service, action, panel, or fusion function. `hybridScore` is only a rejected input field in semantic validation. |
| REST retrieval routes | **NOT PRESENT.** No `app/api/**/retrieval/**`. Admin UI uses server actions only. |
| pgvector | **NOT PRESENT.** Vectors stored as `RetrievalEmbedding.vector Json`. Cosine is in-process. |
| Recruiter outcome labels | **NOT PRESENT.** Official labels are synthetic. |
| Production complementarity of `text-embedding-3-small` vs M8 | **UNKNOWN.** Gate did not run. |
| Whether any deployed environment has `OPENAI_API_KEY` | **UNKNOWN** from this repository. Local evaluation environment did not. |
| Production application volume per job | **UNKNOWN.** Constitution treats ~1,500 as a hypothesis, not a measured production fact. |
| Neon / production pgvector availability | **UNKNOWN.** Intentionally not introduced in M9. |

---

## 2. M8 architecture (verified)

**Versions**

- `retrievalVersion`: `v1-lexical-term-overlap`
- `queryConstructionVersion`: `v1-structured-requirements`
- `normalizationVersion`: `v1-ontology-normalize`
- `method`: `lexical-unique-term-overlap`
- K default 100, min 1, max 2000

**Run model:** `LexicalRetrievalRun`  
company, job, published spec, job-intelligence run, versions, K, searched/retrieved counts, `queryHash`, `evidenceSnapshotHash`, status `RUNNING|COMPLETED|FAILED`.

**Result model:** `LexicalRetrievalResult`  
`applicationId`, `candidateId`, `rank`, integer `lexicalScore`, `matchedTerms[]`, `method`.  
No supporting evidence id. No `candidateScore`.

**Query construction**

`buildLexicalQuery` from Job Intelligence requirement nodes:

- REQUIRED / PREFERRED skills from `primarySkills`, `mustHaveRequirements`, `niceToHaveRequirements`
- LOCATION hard constraints
- Not the raw job-description dump
- Alias expansion via existing ontology (`JS` → `javascript`)

**Candidate generation**

All applications for `(jobId, companyId)`. Corpus assembled by `assembleLexicalCorpus`. Applications from other companies or other jobs are dropped.

**Scoring**

Unique positive canonical-term overlap. Skills require deterministic claims with `POSITIVE` polarity. Negated mentions do not count. Repeated keywords do not increase the score. Location is normalized literal mention.

**Ranking**

`lexicalScore` desc, then `applicationId` asc. Only `lexicalScore > 0` is retrieved. Then slice to K.

**Evidence eligibility**

Shared function `isEligibleRetrievalEvidence`: `revokedAt IS NULL` and `supersededById IS NULL`. Application-scoped or candidate-level (`applicationId` null or this application). Repository also filters those columns. `CandidateProfile.skills` is not used.

**Tenant isolation**

`companyId` on every query and composite FKs on run/result. Cross-company applications/evidence are dropped in corpus assembly.

**Application scoping**

The retrieval unit is the application, not a global candidate. The same candidate on another job is a different application document.

**Provenance**

`matchedTerms` plus generated `whyRetrieved` text. Deterministic. No LLM explanation.

**Idempotency**

Completed-run lookup on company + job + spec + intel run + versions + K + query hash + evidence snapshot hash. SQL partial unique index on `COMPLETED` rows. Stale `RUNNING` (>60s) is failed and retried.

**Authorization**

`requireAdmin()` plus `PortalRole.ADMIN`. Client/interviewer receive not-found. Server action is protected even if UI is bypassed.

**Evaluation hooks**

- Engine: `rankLexicalApplications`
- Metrics: `recallAtK`, `precisionAtK`, `meanReciprocalRank`, `ndcgAtK`
- Dataset: `RETRIEVAL_BENCHMARK_CASES` / `m8-frozen-v1`
- Offline compare: `compareLexicalAndSemanticBaselines` (M9 side is hash-projection)
- Live gate: `evaluateLiveProductionEmbeddings` (M8 side uses the same lexical ranker)

---

## 3. M9 architecture (verified)

**Versions**

- `retrievalVersion`: `v1-semantic-embedding`
- `method`: `semantic-max-evidence-cosine`
- `representationVersion`: `v1-structured-query-evidence-text`
- `queryConstructionVersion`: `v1-structured-requirements` (same construction as M8)
- `normalizationVersion`: `v1-redact-and-trim`
- K bounds reused from M8

**Embedding representation**

Job query text = `kind:sourceText` lines from the structured lexical query.  
Candidate side = one embedding per eligible evidence `inlineText`, after email/phone redaction and trim.  
Not raw JD. Not `CandidateProfile`. Not arbitrary rows.

**Embedding storage**

`RetrievalEmbedding`: company, `sourceType` `JOB_QUERY|EVIDENCE`, `sourceId`, `contentHash`, provider/model/version, dimensions, normalization version, JSON vector, createdAt. Unique on that identity tuple.

**Provider abstraction**

`embedRetrievalTexts`: test override, else OpenAI if `OPENAI_API_KEY`, else fail closed.  
`embedLiveProductionTexts`: OpenAI only; ignores test override; never hash-projection.  
Offline tests use `hash-projection-v1` (32-d). That is not a production model.

**Model / version handling**

Default model `text-embedding-3-small`, 1536 dimensions. Override `OPENAI_EMBEDDING_MODEL` exists. Live gate refuses any model other than `text-embedding-3-small`. Run records provider, model, model version, and dimensions so a historical run stays interpretable after a model change.

**Normalization and hashing**

Redact email/phone, collapse whitespace. Content hash is SHA-256 of the redacted text. Unchanged `(source, hash, model, normalization)` is not re-embedded.

**Evidence eligibility**

Same functions and same repository list as M8. Revoked/superseded embeddings may remain stored but are not loaded into the ranker.

**Query / evidence embedding**

Query embedding source id = job-intelligence run id. Evidence embedding source id = evidence id. Empty redacted text is skipped.

**Application-level aggregation**

Max cosine over eligible evidence vectors for that application. Supporting evidence is the argmax evidence id.

**Cosine**

In-process `cosineSimilarity` after L2-aware validation. Dimension mismatch or zero vectors fail closed. No pgvector query.

**Provenance**

`supportingEvidenceId` + `semanticScore` + generated explanation. No LLM explanation.

**Tenant isolation**

Embeddings listed by `companyId`. Stored rows with a tenant mismatch fail the run. Vector search is not global-then-filter.

**Idempotency**

Same pattern as M8, plus embedding identity fields on the completed-run key. Embedding inserts use `skipDuplicates`.

**Failure behavior**

Unconfigured embeddings: `SEMANTIC_EMBEDDINGS_NOT_CONFIGURED` before a successful run. Provider/invalid/dimension errors fail the run (`FAILED`), not a silent partial success. Admin get-page still works without a key.

**Important ranking difference vs M8**

M9 retrieves any application that has at least one eligible evidence vector. There is **no similarity threshold**. Low cosine values still occupy ranks. M8 retrieves only positive term overlap. This is an experimental-variable difference already in M9, not something M10 should “fix” by adding a threshold.

---

## 4. Exact M8 ↔ M9 interfaces

Shared, already in the repository:

| Interface | Used by |
| --- | --- |
| `executeRunJobIntelligence` + published spec | both services |
| `buildLexicalQuery` / `hashLexicalQuery` | both |
| `listApplicationsForLexicalRetrieval` | both |
| `listEligibleEvidenceForLexicalRetrieval` | both |
| `assembleLexicalCorpus` | both |
| `isEligibleRetrievalEvidence` / `evidenceBelongsToApplication` | both engines |
| `hashEvidenceSnapshot` | both run keys |
| K constants 1 / 100 / 2000 | both |
| Admin `requireAdmin` | both actions |
| `LexicalApplicationDocument` | M9 ranker input type |
| Frozen dataset + metric helpers | both evaluations |

Independent, must stay independent:

| Surface | M8 | M9 |
| --- | --- | --- |
| Engine | `rankLexicalApplications` | `rankSemanticApplications` |
| Score | `lexicalScore` (int) | `semanticScore` (float cosine) |
| Tables | `LexicalRetrieval*` | `RetrievalEmbedding`, `SemanticRetrieval*` |
| Actions / UI | lexical action + panel | semantic action + panel |
| Fail-closed | published spec required | published spec + embedding config |

There is **no** existing fusion function, shared result table, or hybrid run.

M8 and M9 **can remain independently reproducible**. Evaluation already calls each ranker on the same documents. Persistence is in separate tables. M10 must consume their outputs, not rewrite them.

---

## 5. Proposed M10 candidate-generation architecture

Design only. Not implemented.

```
Job Intelligence requirement graph
        │
        ├──────────── M8 lexical rank (unchanged) ─────────┐
        │                                                    │
        └──────────── M9 semantic rank (unchanged) ─────────┤
                                                            ▼
                                              application-id union
                                                            │
                                              versioned fusion
                                                            │
                                              top-K hybrid list
```

Constraints:

- Retrieval unit remains `applicationId` for a job.
- Same eligible evidence, same K, same query construction.
- M8 and M9 lists are computed first and retained.
- Fusion sees only those lists plus their ranks/scores/provenance.
- Fusion must not call Matcher V2, ranking, recruiter feedback, or an LLM.
- Fusion must not write `Application.status`.
- The hybrid score must not be named or treated as `candidateScore`.

If M9 embeddings are unconfigured, hybrid must fail closed or refuse to start. It must not silently become “M8-only” and report success as hybrid.

---

## 6. Fusion approaches (no winner selected)

All three assume the same pre-fusion lists: M8 top-K and M9 top-K on the same corpus. `K` here is the retrieval limit already used by M8/M9 (default 100).

### 6.1 Candidate union, then arbitrary list order

**Method:** unique `applicationId` set. Order by “in both lists first,” or lexical-first, or semantic-first, then `applicationId`.

**Assumptions:** membership is the signal; scores are discarded.

**Strengths:** simplest; no calibration; easy provenance (“in M8”, “in M9”, “in both”).

**Weaknesses:** rank among the union is arbitrary. Recall@K of the union can rise only because the union is larger; that can look like a win while precision falls. Not a ranking method.

**Calibration:** none, unless an implicit priority (lexical-first) is treated as a hidden parameter.

**Failure modes:** semantic false positives enter at high rank if semantic-first; lexical-only relevant hits sink if semantic-first.

**Reproducibility:** high if the tie-break is specified. Scientifically weak as a “better ranker.”

**Use:** diagnostic set-overlap analysis, not a default production ranker.

### 6.2 Reciprocal Rank Fusion (RRF)

**Method:** for each application, `sum 1 / (k_rrf + rank_m)` over lists that contain it. Typical `k_rrf` is 60. Missing list contributes 0. Sort by RRF desc, `applicationId` asc. Slice to K.

**Assumptions:** ranks are more comparable than raw scores. Both lists are independently meaningful.

**Strengths:** no need to mix integer overlap with cosine. One explicit constant (`k_rrf`). Applications found by both methods rise. Standard IR baseline for hybrid.

**Weaknesses:** `k_rrf` is still a parameter. M9 currently ranks almost every evidence-bearing application, so a low-similarity semantic rank still contributes RRF mass. That can promote false friends. Does not encode polarity or ontology distinctions.

**Calibration:** choose and freeze `k_rrf` before looking at test metrics. Do not tune it on the five synthetic cases.

**Failure modes:** React Native / negated Django still enter via M9 rank; RRF may keep them if M8 did not veto. RRF has no veto.

**Reproducibility:** high if `k_rrf`, input K, and sort ties are versioned (`v1-rrf-k60` or similar).

**Use:** strongest *first experiment* because it has fewer free parameters than score fusion. That is not a claim it will win.

### 6.3 Normalized score fusion

**Method:** map `lexicalScore` and `semanticScore` to a common range (min-max per query, or z-score), then `α * lex' + (1-α) * sem'`.

**Assumptions:** the two scores are interval-scale after normalization; `α` is meaningful; per-query min-max is stable.

**Strengths:** can emphasize lexical exactness or semantic recall if a weight is justified.

**Weaknesses:** scales are incompatible today (small integers vs cosine, and M9 has no floor). Per-query min-max depends on who else applied. `α` will be overfit on five synthetic cases. Easy to smuggle a predetermined belief (“0.5/0.5”).

**Calibration:** requires held-out data that does not exist. Recruiter labels do not exist.

**Failure modes:** a lone lexical match of score 1 becomes 1.0 after min-max and can dominate or vanish depending on the rest of the list. Cosine 0.2 vs 0.9 may compress or explode.

**Reproducibility:** poor unless normalization window, `α`, and empty-list behavior are frozen. Historical runs become hard to interpret if the applicant set changes.

**Use:** only after live score distributions are known. Do not pick `α` now.

### 6.4 What not to do in M10

- Weighted sum of raw `lexicalScore` and `semanticScore`
- Similarity threshold chosen as 0.7 / 0.75 / 0.8 without a distribution
- Matcher V2 or evidence-quality rerank (that is later than M10)
- Declaring a fusion winner from hash-projection numbers

---

## 7. Failure-case analysis

Official frozen set (`m8-frozen-v1`) versus diagnostic-only probes. Live `text-embedding-3-small` behavior is UNKNOWN.

| Case | In official set? | M8 observed (engine/tests) | M9 theoretical risk | Hybrid implication |
| --- | --- | --- | --- | --- |
| Exact Python | yes `exact-python` | retrieves app 1; not Java | should also retrieve app 1; may also retrieve Java (no threshold) | Union/RRF can keep the true hit and may promote Java |
| JS synonym | yes `alias-javascript` | retrieves via ontology | depends on embedding of “JS” vs “JavaScript”; live UNKNOWN | If M9 misses and M8 hits, fusion should keep M8 |
| React vs React Native | yes `false-friend-react-native` | does **not** retrieve | tests show M9 *can* retrieve; labeled NOT_RELEVANT | Fusion without veto will likely reintroduce the false friend |
| Negated Django | yes `negation-django` | does **not** retrieve | M9 *can* retrieve; matching layer is where negation lives | Hybrid retrieval can surface it; Matcher V2 must stay separate |
| Sparse “Hello.” | yes `missing-evidence` | does **not** retrieve | hash-projection retrieved it; live UNKNOWN | No-threshold M9 is the risk |
| Java vs Python (same case) | yes, app 2 in `exact-python` | not retrieved | likely retrieved by M9 | Precision risk for any union |
| Python vs Django | diagnostic only | M8 should not treat Django as Python | related-skill confusion | Do not add to official metrics to “help” M10 |
| Java vs JavaScript | diagnostic only | distinct ontology keys | token/embedding confusion | same |
| PostgreSQL vs MySQL | diagnostic only | distinct | related-skill confusion | same |
| Keyword stuffing | diagnostic only | M8 score stays 1 | cosine may still be high | Fusion must not reward stuffing via M9 |
| Verbose evidence | diagnostic only | one positive mention retrieves | long text may dilute or still match | UNKNOWN live |

M8 lexical false negatives expected: vocabulary mismatch beyond the alias table, sparse resumes, synonym blindness.

M9 semantic false positives expected: related-but-distinct skills, negation, no score floor.

Hybrid cannot repair ontology mistakes. High similarity is not skill equivalence. M10 must not change Skill Ontology or Matcher V2 based on embedding proximity.

---

## 8. Evaluation infrastructure M10 would need

Reuse, do not replace:

- `RETRIEVAL_BENCHMARK_CASES`
- `RETRIEVAL_BENCHMARK_DATASET_LABEL` = `SYNTHETIC_NOT_RECRUITER_OUTCOMES`
- `RETRIEVAL_BENCHMARK_DATASET_VERSION` = `m8-frozen-v1`
- eligibility rules
- K = 10, 25, 50, 100 and result limit 100
- `recallAtK`, `precisionAtK`, `meanReciprocalRank`, `ndcgAtK`

Add (when implementation is approved, not now):

- Independent M10 compare that also keeps M8 and M9 columns
- Per-strategy rows: union-overlap, RRF, (later) normalized fusion
- Recovered / introduced / missed vs M8 and vs M9
- Live gate must be `COMPLETED` on `text-embedding-3-small` before treating M10 metrics as production evidence
- Offline hash-projection M10 numbers, if computed, labeled offline diagnostics only
- No new official cases added to improve hybrid scores
- Diagnostic probes stay `DIAGNOSTIC_NOT_IN_BENCHMARK`

The five-case set is too small to tune fusion weights. That is a limitation, not a reason to enlarge the set for a desired outcome.

---

## 9. Valid M10 experiment

Every run of an approved M10 experiment must report, independently:

1. **M8** `v1-lexical-term-overlap`
2. **M9 live** `v1-semantic-embedding` + `text-embedding-3-small`
3. **M10 strategy A** (if implemented): e.g. `v1-hybrid-union`
4. **M10 strategy B** (if implemented): e.g. `v1-hybrid-rrf-k60`

Do not collapse these into one “hybrid vs baseline” number.  
Do not compare M10 to hash-projection and call it production.  
Do not drop M8 or M9 after hybrid exists.

Complementarity questions, not winner slogans:

- Did fusion recover relevant applications M8 missed?
- Did it keep relevant applications M8 already had?
- Did it reintroduce M9 false friends M8 correctly excluded?
- At which K?

---

## 10. Risks

| Risk | Why it exists in this repo | Mitigation if M10 is later approved |
| --- | --- | --- |
| Semantic false positives | M9 has no similarity floor; RN / negation tests already show retrieval | Keep M8 as an independent column; do not veto via Matcher in M10 |
| Lexical false negatives | Alias table is small | Measure live M9 recall first; fusion cannot invent evidence |
| Score-scale incompatibility | int overlap vs cosine | Prefer rank fusion before score fusion |
| Duplicate candidates | Union of two lists | Dedupe on `applicationId` |
| Provenance loss | M8 has terms; M9 has evidence id | Hybrid result should store both source ranks/scores and source methods |
| Tenant leakage | Vector temptation to search globally | Reuse tenant-scoped corpus loaders; never query embeddings without `companyId` |
| Application/evidence mistakes | Evidence can be candidate-level | Keep `evidenceBelongsToApplication` |
| Reproducibility | Model, hash, K, fusion constant | Version the fusion method; record M8/M9 run ids |
| API cost / latency | OpenAI embeddings; M9 already batches 64 | Reuse `RetrievalEmbedding`; do not re-embed for hybrid |
| Stale embeddings | Content hash + normalization version | Same invalidation as M9; do not invent a second store |
| Embedding model change | Historical runs must stay readable | Hybrid run records the same model identity as M9 |
| Confirmation bias | Tiny synthetic set | Do not tune `α` or `k_rrf` on these five cases |
| Silent M8-only hybrid | M9 fail-closed if no key | Hybrid must not report COMPLETED if M9 did not run |
| Layer collapse | Matcher / ranking / hire | Out of scope for M10 |

---

## 11. Proposed M10 architecture (not implemented)

If and only if GO criteria below are met:

1. Keep M8 and M9 services exactly as they are.
2. Add a hybrid service that:
   - authorizes Admin the same way
   - loads the same job / spec / intel / applications / eligible evidence
   - calls `rankLexicalApplications` and `rankSemanticApplications` (or reuses completed runs with matching idempotency keys)
   - unions application ids
   - applies a **versioned** fusion method
   - persists a new hybrid run/result
3. First fusion experiment, if any: RRF with a frozen `k_rrf` chosen before metrics are inspected. Union overlap reported as a set-analysis companion, not as the ranked product.
4. Normalized score fusion deferred until live score distributions exist.
5. Admin UI: third panel, visually distinct, M8 and M9 remain.
6. Evaluation: same dataset, three-or-more columns, synthetic label retained.

Suggested future version strings (not created):

- `v1-hybrid-union` (set analysis)
- `v1-hybrid-rrf-k60` (first ranked experiment)

---

## 12. Proposed database / model changes (do not migrate)

Additive only, modeled on M8/M9. Not created.

**`HybridRetrievalRun`**

- `companyId`, `jobId`, `jobSpecificationVersionId`, `jobIntelligenceRunId`
- `status` RUNNING / COMPLETED / FAILED
- `retrievalVersion`, `fusionVersion`, `fusionK` (RRF k if used)
- `lexicalRetrievalVersion`, `semanticRetrievalVersion`
- embedding identity fields copied from the M9 list used
- optional `lexicalRunId`, `semanticRunId`
- `resultLimit`, counts, hashes, timestamps, `errorCode`

**`HybridRetrievalResult`**

- `applicationId`, `candidateId`, `rank`
- `fusionScore` (not `candidateScore`)
- `lexicalRank`, `lexicalScore` nullable
- `semanticRank`, `semanticScore` nullable
- `supportingEvidenceId` nullable
- `matchedTerms` nullable
- `sourceMethods` e.g. `lexical`, `semantic`, `both`
- `method`

Do not alter `LexicalRetrieval*` or `SemanticRetrieval*` or `RetrievalEmbedding`.  
Do not add pgvector.  
Do not add a global candidate similarity table.

---

## 13. Proposed API / service changes (do not implement)

Mirror existing Admin-only server actions. No public REST route exists today; do not add one for M10.

Conceptual (not created):

- `lib/retrieval/hybrid-engine.ts` — pure fusion on already-ranked lists
- `lib/retrieval/hybrid-retrieval-service.ts` — Admin, tenant checks, persist
- `app/actions/hybrid-retrieval-actions.ts`
- `components/requirements/HybridRetrievalPanel.tsx`
- `lib/evaluation/hybrid-retrieval-comparison.ts` — M8 vs M9 vs each M10 strategy
- Reject `candidateScore`, `hybridScore` as a quality field, `status`, and raw `companyId` from the browser

Service rules:

- Fail closed if embeddings are not configured
- Do not complete a hybrid run if M9 ranking did not finish
- Do not write application status
- Do not reorder with Matcher V2

---

## 14. Proposed test plan (not added)

When implementation is approved:

- Fusion unit tests: union dedupe; RRF formula; tie-break `applicationId`; K slice
- Invariance: M8 and M9 rank outputs unchanged when hybrid is imported
- Eligibility: revoked/superseded still excluded because inputs come from M8/M9
- Tenant: foreign `companyId` dropped before fusion
- Authorization: non-Admin denied
- Fail closed: no API key → no COMPLETED hybrid
- False-friend cases: RN and negated Django documented as fusion-in if M9 retrieved them
- Evaluation: official case ids unchanged; label still `SYNTHETIC_NOT_RECRUITER_OUTCOMES`
- No `candidateScore` in persisted rows
- Existing M0–M9.1 tests still pass

Do not change current tests for this design document.

---

## 15. GO / NO-GO for implementation

### NO-GO (current state)

M10 implementation is **not approved**.

Any of the following keeps it NO-GO:

1. M9.1 status is `NOT_RUN` or `PARTIAL`. **This is true today.**
2. Live evaluation used `hash-projection-v1` or a test override and was labeled production.
3. Official dataset, labels, eligibility, query construction, or K would be changed to improve hybrid numbers.
4. M8 or M9 semantics would be edited to make fusion look better.
5. The first hybrid commit would include rerank, Matcher V2 reorder, `candidateScore`, status writes, a new embedding provider, or pgvector.
6. Fusion weights / thresholds would be chosen without live score distributions or a pre-registered constant.

### GO (all required)

Implementation of a **measurement M10** may be considered only when every item is true:

1. `evaluateLiveProductionEmbeddings()` returns `COMPLETED` for `openai:text-embedding-3-small` on `m8-frozen-v1`.
2. The live report is stored without credentials or raw evidence.
3. M8 vs live M9 complementarity is documented (recovered / introduced / missed), **without** declaring M9 superior from a single metric bump.
4. There is a written reason to measure fusion: either live M9 recovers something M8 misses, or live M9 introduces errors M8 avoids and fusion is the thing being tested — not a product default.
5. M8 and M9 remain independently runnable and persistable.
6. First ranked fusion, if any, is a pre-registered rank method (RRF with frozen `k_rrf`), not an ad-hoc `0.5/0.5` score mix.
7. Hybrid remains retrieval-only.

A GO to *implement a measurement* is not a GO to *ship hybrid as the product retriever*.

---

## Unresolved questions

1. What does live `text-embedding-3-small` do on React Native, negation, and sparse “Hello.”? UNKNOWN until M9.1 completes.
2. Is the official five-case set large enough to prefer any fusion? Almost certainly no; it is only enough to keep the experiment honest.
3. Should hybrid reuse persisted M8/M9 runs or recompute in-process? Recompute is simpler and matches current eval; reuse is cheaper and needs key equality. Not decided.
4. Should M9 later grow a similarity floor? Not in M10. Needs a live score distribution first. No 0.7-style guess.
5. Are there real recruiter judgments? No. UNKNOWN when they will exist.
6. What is production cost/latency at real application volume? UNKNOWN.

---

## Implementation prerequisites

- Completed live embedding gate on `text-embedding-3-small`
- This design reviewed
- Explicit implementation prompt that forbids M8/M9 semantic edits
- Additive migration only, if tables are approved
- No `prisma migrate reset`

---

## Post-M9.1 experiment registration

Recorded after the completed live gate. This section does not implement M10
and does not run hybrid retrieval.

### Measured facts, not reinterpreted

On `m8-frozen-v1`, labels `SYNTHETIC_NOT_RECRUITER_OUTCOMES`:

| | M8 `v1-lexical-term-overlap` | M9 live `openai:text-embedding-3-small` |
| --- | --- | --- |
| Recall@10, @25, @50, @100 | 0.4 | 0.4 |
| Precision@K | 0.4 | 0.3 |
| NDCG@K | 0.4 | 0.4 |
| MRR | 0.4 | 0.4 |

Relevant applications recovered by M9 that M8 missed: none. M9 did not miss a
relevant application M8 found. M9 introduced labeled-not-relevant applications
on `exact-python` (application 2), `false-friend-react-native`,
`negation-django`, and `missing-evidence`. Relevant-recall complementarity is
**not demonstrated**. M9 precision on this frozen benchmark was lower. That is
not a claim that M9 is useless, and it is not evidence about recruiter
outcomes.

### Fusion method

**REGISTERED.** This freezes the first experiment. It does not authorize
implementation, and it is not an optimized parameter. No hybrid metrics were
inspected or run before this freeze.

Section 6.2 permits RRF as the strongest first experiment because it does not
mix integer overlap with cosine and has one constant. No other `k_rrf` value
is proposed. The only number the design names is the typical value 60, and the
only ranked version string it names for that first experiment is
`v1-hybrid-rrf-k60`. Score fusion remains deferred. Sixty is registered for
that reason, not because a benchmark preferred it.

- FUSION_METHOD: RRF
- FUSION_VERSION: `v1-hybrid-rrf-k60`
- RRF_K: 60

60 is a pre-registered first experimental parameter. It is not an optimized
parameter. It was frozen before hybrid metrics are inspected. No post-hoc
tuning is permitted for this first experiment. M8 remains frozen. M9 remains
frozen. Hybrid remains retrieval-only.

Weighted `lexicalScore + semanticScore`, and any other direct mixing of those
scales, stays prohibited. Those scores do not share a scale.

### What is already frozen, independent of fusion

- Lexical baseline: M8 `v1-lexical-term-overlap`
- Semantic baseline: the existing frozen M9 implementation
- Live model, if M9 is used: `openai:text-embedding-3-small`
- Evaluation: `m8-frozen-v1`
- Labels: `SYNTHETIC_NOT_RECRUITER_OUTCOMES`
- K: 10, 25, 50, 100
- Hybrid input, when an experiment exists: the union of the M8 retrieved
  application set and the M9 retrieved application set. No extra corpus.
- Comparison columns, when an experiment exists: M8, M9, and hybrid, reported
  separately. Hybrid must not replace either baseline.
- Metrics, when an experiment exists: Recall@10, Recall@25, Recall@50,
  Recall@100, Precision@K, NDCG@K, MRR
- Interpretation, with no numeric success bar: exploratory comparative
  measurement; no pre-registered minimum improvement threshold. Distinguish
  recall gain, precision gain, a precision/recall trade, a rank change with
  unchanged recall, no measurable benefit, and additional false positives.
  A higher hybrid number is not defined as success.

### Future implementation contract

This contract is not an implementation approval.
`M10_IMPLEMENTATION_AUTHORIZED` remains **NO**.

Future M10 implementation MUST NOT modify M8 or M9 semantics.

It must also be:

- additive only
- free of destructive migrations
- free of `candidateScore`
- free of application status changes
- retrieval-only: no hiring recommendation, automatic shortlist, automatic
  rejection, automatic hiring, or replacement of a recruiter decision
- tenant-scoped, with the same company isolation as M8 and M9, and no global
  candidate retrieval
- provenance-preserving for each result: whether M8 retrieved it, its M8 rank,
  whether M9 retrieved it, its M9 rank, and which fusion method produced the
  hybrid rank
- independently runnable for M8 and M9
- bound to frozen experiment parameters once those parameters exist
- free of post-hoc tuning

Persistence, if later approved, must be additive, tenant-scoped, versioned,
immutable for completed runs, provenance-preserving, and idempotent. No hybrid
tables and no migrations are created by this registration attempt.

No API credentials and no extra raw evidence text belong in hybrid records.
M9’s privacy boundary stays unchanged.

## Implementation contract and persistence audit

This section is a contract and an audit. It does not implement M10, create tables, or authorize implementation. `M10_IMPLEMENTATION_AUTHORIZED` remains **NO**.

### Registered experiment

- METHOD: RRF
- VERSION: `v1-hybrid-rrf-k60`
- RRF_K: 60
- DATASET: `m8-frozen-v1`
- LABELS: `SYNTHETIC_NOT_RECRUITER_OUTCOMES`
- K: 10, 25, 50, 100
- BASELINES: M8 `v1-lexical-term-overlap`, frozen M9
- HYBRID INPUT: the union of one completed M8 result set and one completed M9 result set. Hybrid does not retrieve additional applications and does not apply a second evidence-eligibility rule.

`RRF(d) = Σ 1 / (60 + rank_i(d))` over only the lists in which application `d` appears. `rank_i` is the 1-based `rank` already stored on `LexicalRetrievalResult` and `SemanticRetrievalResult` (`index + 1` after each baseline sort). An application missing from a list contributes nothing from that list. No normalization. No `lexicalScore + semanticScore`. No weight. `k` stays 60.

Tie-break, from section 6.2 and from both engines: higher RRF first, then lower `applicationId`. M8 sorts `lexicalScore` descending then `applicationId` ascending. M9 sorts `semanticScore` descending then `applicationId` ascending. That is the repository rule. It is not unresolved.

Revoked and superseded evidence never enters the hybrid universe directly. M8 and M9 already drop it before they rank. A completed baseline run stays a snapshot: later revocation does not rewrite its result rows, and hybrid must not re-filter them.

### Provenance

Each hybrid result row must be able to answer: retrieved by M8 or not, M8 rank or null, retrieved by M9 or not, M9 rank or null, hybrid rank, and fusion version `v1-hybrid-rrf-k60`. Baseline result rows stay in their own tables.

### Tenant and authorization

Follow the M8 and M9 services. `companyId` comes from the job’s company. Loaders already require `application.companyId`, `evidence.companyId`, and the intelligence run to match that company, and they fail closed on a mismatch. Admin stays platform-global through `requireAdmin`. Hybrid must not invent a company-bound Admin and must not search across companies. Execution stays on the server. No API key and no extra raw evidence text in the hybrid record.

### Persistence audit

M8 and M9 already persist a run plus per-application result rows. Hybrid can read those rows. It cannot store its own ranking there without writing into frozen tables.

Recomputing RRF from immutable baseline rows is deterministic only while the fusion code stays the same. The contract says a completed hybrid run must not change when fusion code, `k`, or dataset identity later changes. That requires a stored snapshot. Persistence is required for the experiment record. It is not required to re-rank evidence.

Proposed additive models only, following `LexicalRetrievalRun` / `LexicalRetrievalResult`. Not created.

`HybridRetrievalRun`: `companyId`, `jobId`, `jobSpecificationVersionId`, `lexicalRunId`, `semanticRunId`, `status`, `fusionVersion` (`v1-hybrid-rrf-k60`), `rrfK` (60), `resultLimit`, `datasetVersion` (`m8-frozen-v1` for this experiment), `createdAt`, `completedAt`, `errorCode`. Copy the lexical and semantic retrieval version strings from the cited runs so the snapshot names the exact baselines.

`HybridRetrievalResult`: `companyId`, `runId`, `applicationId`, `candidateId`, `rank`, `rrfScore`, `lexicalRank` nullable, `semanticRank` nullable, `fusionVersion`. `rrfScore` is the fusion sum. It is not `candidateScore`.

No unique database constraint exists today on the full M8 or M9 idempotency key. Completion is an application lookup: `findCompletedLexicalRetrievalRun` / `findCompletedSemanticRetrievalRun` match the key plus `COMPLETED`, latest `id`. A fresh RUNNING row is refused while it is inside the stale window; a stale RUNNING row is failed and retried; the write transaction checks again for a completed row. Hybrid should use that same behavior. Do not invent a new lock.

Idempotency key, from that pattern plus the fusion identity: `companyId`, `lexicalRunId`, `semanticRunId`, `fusionVersion`, `rrfK`, `resultLimit`. Those run ids already carry company, job, specification, intelligence run, baseline versions, query hash, and evidence snapshot hash. Two executions with that same key are the same experiment. A completed row is reused. Concurrent execution follows the M8/M9 running-row rule above.

Completed hybrid rows are not updated in place. A new fusion version or a new `k` is a different key and a different run.

### Evaluation and interpretation

Report M8, M9, and hybrid as separate columns on `m8-frozen-v1` with label `SYNTHETIC_NOT_RECRUITER_OUTCOMES`, at K 10, 25, 50, and 100, for Recall, Precision, NDCG, and MRR. Do not change the benchmark. Do not tune RRF against it.

Exploratory comparative measurement; no pre-registered minimum improvement threshold. Distinguish: relevant-recall gain, precision gain, a precision/recall trade, a rank change without recall gain, no measurable benefit, and additional false positives. A higher hybrid number is not success by itself.

### Future implementation prompt

When implementation is later and separately authorized, that prompt must say:

MUST NOT: modify M8 semantics; modify M9 semantics; change Matcher V2; change the Candidate Evidence Graph; change evidence eligibility; add `candidateScore`; modify application status; implement hiring decisions; tune RRF after seeing metrics; alter the frozen benchmark; bypass tenant isolation; create destructive migrations.

MUST: keep M8 and M9 independently runnable; use RRF `v1-hybrid-rrf-k60` with `k = 60`; use only the M8 ∪ M9 result sets; preserve provenance; stay retrieval-only; preserve tenant isolation; return deterministic ranks; record the experiment metadata above.

This prompt does not exist yet. Writing this contract does not create it and does not authorize implementation.

## Official frozen experiment result

Measured `2026-10-07T08:24:02.150Z`. Command: `pnpm exec tsx` of a one-off metric script. Exit status 0. This did not change M8, M9, or M10 source.

Inputs are the completed M9.1 case lists recorded `2026-10-07T07:32:27.531Z` for `openai:text-embedding-3-small` on `m8-frozen-v1`. Those lists were fused with the implemented `v1-hybrid-rrf-k60` function, `k = 60`, order RRF descending then `applicationId` ascending. No score mixing. No `candidateScore`. No application-status writes. Five official cases. Diagnostic probes were not included. The headline M9.1 table was not copied in; these averages were recomputed from the case lists with the same Recall, Precision, NDCG, and MRR functions.

Because every official list has at most two applications, K 10, 25, 50, and 100 are the same number.

| Metric | M8 | M9 | M10 | M10 − M8 | M10 − M9 |
| --- | --- | --- | --- | --- | --- |
| Recall@10/25/50/100 | 0.4 | 0.4 | 0.4 | 0 | 0 |
| Precision@10/25/50/100 | 0.4 | 0.3 | 0.3 | -0.1 | 0 |
| NDCG@10/25/50/100 | 0.4 | 0.4 | 0.4 | 0 | 0 |
| MRR | 0.4 | 0.4 | 0.4 | 0 | 0 |

Labels remain `SYNTHETIC_NOT_RECRUITER_OUTCOMES`. On this set, hybrid did not raise relevant recall above M8 or M9. Precision matches M9 and is lower than M8, because RRF keeps the M9-only labeled-not-relevant rows. NDCG and MRR match both baselines. That is not a claim that hybrid is a better retriever, and it is not evidence about recruiter outcomes or hiring quality.

## M10 post-experiment audit

This section interprets the measured result above. It does not change the registered experiment, the metrics, M8, M9, or M10, and it does not run another experiment. Labels stay `SYNTHETIC_NOT_RECRUITER_OUTCOMES`. Diagnostic probes are excluded.

### Case-level record

Ranks below are the recorded retrieved order. M10 ranks come from `v1-hybrid-rrf-k60`.

| Case | Relevant | M8 | M9 | M10 |
| --- | --- | --- | --- | --- |
| `exact-python` | 1 strongly relevant; 2 not relevant | 1 at rank 1 | 1 at rank 1, 2 at rank 2 | 1 at rank 1 (both lists, rank 1 and 1); 2 at rank 2 (M9 only, rank 2) |
| `alias-javascript` | 1 relevant | 1 at rank 1 | 1 at rank 1 | 1 at rank 1 (both lists, rank 1 and 1) |
| `false-friend-react-native` | none; 1 is not relevant | none | 1 at rank 1 | 1 at rank 1 (M9 only, rank 1) |
| `negation-django` | none; 1 is not relevant | none | 1 at rank 1 | 1 at rank 1 (M9 only, rank 1) |
| `missing-evidence` | none; 1 is not relevant | none | 1 at rank 1 | 1 at rank 1 (M9 only, rank 1) |

No official case has a relevant application missed by M8, by M9, or by M10. M9-only labeled-not-relevant applications are `exact-python` application 2, and application 1 on `false-friend-react-native`, `negation-django`, and `missing-evidence`. M10 keeps all four. M10 removes none of them. There is no M8-only retrieved application. No case has two relevant applications, so M10 does not reorder relevant applications. In `exact-python`, the not-relevant application stays behind the relevant one.

### Complementarity

M9 did not retrieve a relevant application that M8 missed. M8 did not retrieve a relevant application that M9 missed. M10 cannot add an application that neither baseline retrieved, and it did not surface a relevant application that was absent from both lists. Useful complementarity on labeled relevant cases is **not demonstrated**. The lists differ only because M9 adds labeled-not-relevant applications.

### What RRF did

An application in both lists receives both `1/(60+rank)` terms. On `exact-python` and `alias-javascript`, application 1 is rank 1 in both lists, so its score is `1/61 + 1/61`. It was already first in both baselines, so the extra term does not change who is first. An M9-only application receives one term. Application 2 on `exact-python` scores `1/62` and stays second. The three single-application false-positive cases score `1/61` and remain the only retrieved row. No M8-only candidate was elevated. RRF rewarded agreement where both lists already agreed, and it preserved every M9-only false positive. That is not a validated new value of `k`.

### What this benchmark cannot say

There are five official cases. Every official retrieved list has at most two applications, so K 10, 25, 50, and 100 collapse to the same aggregate. The set can show whether a labeled relevant application is retrieved and whether a labeled-not-relevant application is also retrieved. It cannot show K sensitivity, ordering among a long candidate list, recruiter judgments, or hiring outcomes. The supported scope is: RRF did not demonstrate an advantage on this frozen synthetic benchmark. That is not a claim that RRF does not work in general.

### Scientific conclusion

Demonstrated on this benchmark: no relevant-recall gain for M10 over M8 or M9; precision equal to M9 and 0.1 below M8; NDCG and MRR unchanged; no useful relevant-case complementarity; M10 keeps the M9 false positives.

Not demonstrated: that hybrid retrieval is better; that it improves ranking quality; that it would help on a larger pool; that it measures recruiter effectiveness, hiring accuracy, or production candidate quality.

### Engineering conclusion

M10 remains a recorded frozen baseline. The implementation, the `k = 60` formula, persisted run metadata, and per-row M8/M9 ranks were checked by tests and by one admin browser smoke. This audit does not redesign or delete that layer. A negative metric result is not a reason to rewrite the frozen experiment.

### M11 implication

Constitution §66 places reranking after hybrid retrieval. The build roadmap calls M11 evidence-aware reranking and gates it on measurable retrieval. This experiment motivates looking at reranking as a research question. It does not prove that M11 is necessary or that it would succeed.

The problem a later reranking evaluation would have to face, using only these official cases, is the labeled-not-relevant rows M9 retrieved and M10 kept: a React Native mention against a React requirement, a negated Django mention, a sparse “Hello.” against Python, and a Java mention against Python. HireIQ already has Matcher V2 and the Candidate Evidence Graph as separate evidence layers. Whether reranking should use them, and whether it can drop those false positives while keeping the relevant rows, is not answered here. Any such layer would still be decision support, not an automatic hire. M11 is not implemented.

## Verification of this document

This file is design-only. No application behavior was changed to produce it.
No migration was created. No M10 code was written.
