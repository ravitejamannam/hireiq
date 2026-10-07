# M11 evidence-aware reranking — research design

STATUS: IMPLEMENTED

M11_IMPLEMENTATION_AUTHORIZED: YES for `v1-evidence-rerank-lex-required-skills` only

M11_EVALUATION: COMPLETED on m8-frozen-v1. See the measured result below. The policy was not changed after the result.

This audit does not implement a reranker, change M8, M9, or M10, or run a new experiment.

## Research hypothesis

M10 did not remove the labeled-not-relevant applications that M9 retrieved. Those official cases are a React Native mention against a React requirement, a negated Django mention, a sparse “Hello.” against Python, and a Java mention against Python. The two labeled relevant applications stayed first under M8, M9, and M10.

Hypothesis, not a result: evidence-aware reranking might suppress those false positives in the ordering while keeping the relevant applications. M10 motivates that question. It does not prove it.

## Retrieval versus reranking

Retrieval decides which applications are in the candidate set. Reranking decides the order of applications already in that set.

M11 must not retrieve new applications, search another corpus, call M8, call M9, or call an external model. It must not delete an application from the set before metrics are computed. It must not change application status or emit a hire or reject decision.

## Candidate universe

The input is the full result list of one completed M10 run (`v1-hybrid-rrf-k60`). Every application M10 returned stays in the set. M11 does not add applications M10 did not retrieve.

K for comparison is the same list as M10: 10, 25, 50, and 100. On `m8-frozen-v1`, every official M10 list has at most two applications, so those K values describe the whole set. Reordering cannot change Recall@K or Precision@K when K is at least the size of the set. Only NDCG and MRR can move, and only if a relevant application changes position.

## Signals that exist

Persisted or already computed, without a new model:

- Matcher V2 assessments: `SUPPORTED`, `CONTRADICTED`, `UNKNOWN`, `UNSUPPORTED`, plus `reasonCode`, `claimId`, and `evidenceId`. Deterministic V2 does not emit `PARTIALLY_SUPPORTED`.
- Claims: skill or location, polarity `POSITIVE` or `NEGATED`, canonical key, alias flag, evidence id, and span offsets.
- Job Intelligence requirements: category, source field, normalized value, skill canonical key.
- Evidence graph edges that copy those links: `EVIDENCE_SUPPORTS_CLAIM`, `CLAIM_MAPS_TO_SKILL`, `REQUIREMENT_REQUIRES_SKILL`, `CLAIM_CITED_FOR_REQUIREMENT`, `ASSESSMENT_CITES_EVIDENCE`, `ASSESSMENT_CITES_CLAIM`.
- M10 rank, `rrfScore`, and nullable M8 and M9 ranks.

`SUPPORTED` means available evidence supports that requirement text. It does not mean the candidate is good. `CONTRADICTED` means a negated skill claim for that exact canonical key. `UNKNOWN` means no supporting claim. The matcher text says UNKNOWN is not a rejection.

Negation is already in the extractor: a prefix such as “no” or “not” before a skill span is `NEGATED`, and Matcher V2 maps that to `CONTRADICTED` for the same canonical key. “Django” and “no Django” are different polarities. M11 can read that state. It must not add a new negation parser.

False friends are exact-key mismatches, not a new ontology. React and React Native are different canonical keys, so a React Native claim does not `SUPPORT` a React requirement. Java does not support Python. A sparse “Hello.” produces no skill claim, so the requirement stays `UNKNOWN`. Alias matches are only the existing alias table, such as JS to JavaScript.

Unavailable for this policy: recruiter judgments, learned weights, a cross-encoder, and any new graph edge. Unsafe: `CandidateProfile.skills` and other profile-only fields. The evidence graph already voids profile skills. A signal with no `evidenceId` must not enter the order.

## First policy

Version: `v1-evidence-rerank-lex-required-skills`

No scalar score. No `candidateScore`. The order is lexicographic, best first:

1. Fewer `CONTRADICTED` required-skill assessments.
2. More `SUPPORTED` required-skill assessments.
3. Earlier M10 rank.

`UNKNOWN` and `UNSUPPORTED` do not count as support and do not count as contradiction. They do not remove the application. Required-skill assessments are Matcher V2 rows whose requirement is a required skill, using the matcher’s existing skill test. Preferred skills, responsibilities, ambiguous text, and non-location constraints are ignored in this first policy.

Location is excluded. M8 treats location as a query constraint and Matcher V2 treats it as an exact positive claim. The five official cases do not judge location. Mixing it in would add a second meaning without a frozen case.

Coding tests, interviews, and assessment citations are excluded. Those edges exist, but these official failures are requirement-text false positives, and an assessment score would be a quality reading the repository does not define.

Counts are unweighted. There is no per-requirement weight. Requirement satisfaction here means those Matcher V2 states. It is not retrieval coverage and not candidate quality.

Output for each application: M10 rank, M10 `rrfScore`, rerank position, the two counts, and the assessment, claim, evidence, and requirement ids used in the counts. The meaning is the order of applications M10 already retrieved. It is not a hire probability.

## Experiment, not yet run

Input: the recorded M10 order for each official `m8-frozen-v1` case. Baseline: that M10 order. Output: the lexicographic order. Labels: `SYNTHETIC_NOT_RECRUITER_OUTCOMES`. Metrics: Precision@K, NDCG@K, MRR, and Recall@K at 10, 25, 50, and 100, reported beside M10, with the K interpretation above. No minimum improvement threshold is currently registered.

This benchmark can show whether the policy moves the labeled relevant row or leaves a one-row false-positive list unchanged. It cannot show a precision gain from reordering when the false-positive case has only one application, because the set does not change. It cannot show recruiter effectiveness. A larger set would be required before a strong claim. This audit does not add cases and does not rerun M10.

## Persistence, tenancy, privacy

The five-case comparison can be computed in memory from recorded M10 lists plus existing deterministic claims and Matcher V2. No table is required for that measurement.

A later admin rerank of a real M10 run would need its own immutable snapshot so M10 rows are not rewritten. Proposed only, not created: a rerank run pointing at `hybridRunId`, `rerankVersion`, and `policyVersion`, plus result rows with application id, M10 rank, `rrfScore`, rerank position, contradicted count, supported count, and the cited assessment ids. Same key means the same M10 run and the same policy. Completed rows are not updated in place.

Company scope stays on the job and the cited M10 run, as in M8 through M10. Execution is Admin-only. Clients, interviewers, and candidates do not get a rerank action. The policy reads stored claims and assessments. It does not send text to an external model.

## Risks

The five synthetic cases can be overfit if a later policy is tuned to them. A lexicographic order can still be mistaken for a hidden quality score if the UI presents one number. Profile skills must stay out. `UNKNOWN` must not be sorted as a rejection. Assessments and location can distort the order if they are added without a frozen case. Graph edges and Matcher V2 rows can be stale relative to the M10 snapshot; a future persisted run must cite the assessment ids it used. Tenant scope has to follow the M10 run’s company.

## Decision

M11_RESEARCH_DECISION: CONDITIONAL-GO

The policy is grounded in Matcher V2 states that already exist, and it does not introduce a hiring score. The frozen M10 lists are a weak test: three false-positive cases have one application, so reordering cannot change them, and the relevant applications are already first. Implementation is not authorized. A later implementation contract would have to freeze this version string, forbid M8, M9, and M10 edits, and state that the five-case set cannot by itself justify shipping the reranker.

## Official frozen evaluation

Measured `2026-10-07T08:43:09.356Z` with the existing rerank function and the existing deterministic extractor and Matcher V2, applied to the recorded M10 orders for the five official cases. No source file was changed. No new cases, labels, or K values. No persistence.

Every official M10 list has one or two applications, so K 10, 25, 50, and 100 cover the whole list. Recall and precision cannot change unless the order changes inside a list longer than K. None of these lists are longer than K, and no order changed.

| Case | Relevant | Not relevant | M10 order | M11 order | Counts |
| --- | --- | --- | --- | --- | --- |
| `exact-python` | 1 | 2 | 1, 2 | 1, 2 | 1: contradicted 0, supported 1. 2: contradicted 0, supported 0 |
| `alias-javascript` | 1 | none | 1 | 1 | contradicted 0, supported 1 |
| `false-friend-react-native` | none | 1 | 1 | 1 | contradicted 0, supported 0 |
| `negation-django` | none | 1 | 1 | 1 | contradicted 1, supported 0 |
| `missing-evidence` | none | 1 | 1 | 1 | contradicted 0, supported 0 |

| Metric | M10 | M11 | M11 − M10 |
| --- | --- | --- | --- |
| Recall@10/25/50/100 | 0.4 | 0.4 | 0 |
| Precision@10/25/50/100 | 0.3 | 0.3 | 0 |
| NDCG@10/25/50/100 | 0.4 | 0.4 | 0 |
| MRR | 0.4 | 0.4 | 0 |

The contradiction on `negation-django` is real, but that list has one application, so the count cannot move it. The supported Python application was already ahead of the unsupported Java application. Labels remain `SYNTHETIC_NOT_RECRUITER_OUTCOMES`. The result is neutral on this benchmark. It does not show a reranking gain, and it does not show recruiter or hiring outcomes.

## Implementation

`v1-evidence-rerank-lex-required-skills` is implemented as an in-memory reorder of one completed M10 run. It reads stored Matcher V2 assessments and does not write them, M10 rows, or a rerank table. The official five-case result is recorded above. The admin panel states that the order is not a hiring recommendation and is not saved.
