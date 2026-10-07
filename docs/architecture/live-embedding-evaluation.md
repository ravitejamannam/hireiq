# Live embedding evaluation gate (M9.1)

**Document state:** EVALUATION RECORD

This is not a product change. M8 and M9 retrieval semantics are unchanged.
M10 hybrid retrieval was not implemented.

## LIVE EMBEDDING EVALUATION STATUS

**COMPLETED**

`productionComplete`: true

Recorded at: `2026-10-07T07:32:27.531Z`

Command: `pnpm eval:live-embeddings`

Provider: OpenAI. Model: `text-embedding-3-small`. Dimensions: 1536.
Embedder label: `openai:text-embedding-3-small`.

`hash-projection-v1` was **not** used. The earlier missing-key run remains
historical only (`LIVE_PRODUCTION_EMBEDDING_NOT_RUN` at
`2026-09-25T15:36:59.885Z`).

## What this gate measures

When configured, the live path embeds the frozen M8/M9 synthetic cases with:

- provider: OpenAI
- model: `text-embedding-3-small`
- dimensions: 1536
- retrieval version: `v1-semantic-embedding`
- query construction: `v1-structured-requirements`
- representation: `v1-structured-query-evidence-text`
- dataset: `m8-frozen-v1`
- dataset label: `SYNTHETIC_NOT_RECRUITER_OUTCOMES`
- K: 10, 25, 50, 100
- result limit: 100

Official metrics use only `RETRIEVAL_BENCHMARK_CASES`. Diagnostic probes are
labeled `DIAGNOSTIC_NOT_IN_BENCHMARK` and are not averaged into Recall@K.

## Privacy

A live run sends redacted structured-query text and eligible evidence text to
OpenAI. Candidate IDs, emails, phone numbers, and company identifiers are not
included in the embedding payload. Transmitted evidence is not logged.

## Offline hash-projection result (not production evidence)

The existing M9 offline comparison remains:

| Metric | M8 lexical | M9 hash-projection-v1 |
| --- | --- | --- |
| Recall@10/25/50/100 | 0.4 | 0.4 |
| Precision@K | 0.4 | 0.3 |
| NDCG@K | 0.4 | 0.4 |
| MRR | 0.4 | 0.4 |

That table is **not** evidence about `text-embedding-3-small`.

## Live comparison table

Official metrics only. These are not a claim that M9 is superior to M8.

| Metric | M8 | M9 live `text-embedding-3-small` | Difference |
| --- | --- | --- | --- |
| Recall@10 | 0.4 | 0.4 | 0 |
| Recall@25 | 0.4 | 0.4 | 0 |
| Recall@50 | 0.4 | 0.4 | 0 |
| Recall@100 | 0.4 | 0.4 | 0 |
| Precision@10/25/50/100 | 0.4 | 0.3 | -0.1 |
| NDCG@10/25/50/100 | 0.4 | 0.4 | 0 |
| MRR | 0.4 | 0.4 | 0 |

Live similarity scores on official retrieved rows: count 6, min 0.174, max 0.482, mean 0.364, median 0.415. No similarity threshold was chosen.

## Complementarity

Official cases only. `recoveredByM9` was empty on every case. `missedByM9` was empty on every case. M9 introduced labeled-not-relevant applications on `exact-python` (application 2), `false-friend-react-native`, `negation-django`, and `missing-evidence`. `alias-javascript` matched M8.

| Failure mode | In official frozen set | Live result |
| --- | --- | --- |
| React vs React Native | yes (`false-friend-react-native`) | M8 retrieved none. M9 introduced application 1 (score 0.443) |
| Negated Django | yes (`negation-django`) | M8 retrieved none. M9 introduced application 1 (score 0.387) |
| Sparse evidence | yes (`missing-evidence`) | M8 retrieved none. M9 introduced application 1 (score 0.174) |
| Related Java vs Python | yes (`exact-python` app 2) | M8 retrieved relevant application 1 only. M9 also introduced application 2 (score 0.252) |
| JS alias | yes (`alias-javascript`) | Both retrieved relevant application 1 only (M9 score 0.482) |
| Python vs Django | diagnostic only | lexical not retrieved; semantic retrieved (score 0.220). Not in official metrics |
| Java vs JavaScript | diagnostic only | lexical not retrieved; semantic retrieved (score 0.242). Not in official metrics |
| PostgreSQL vs MySQL | diagnostic only | lexical not retrieved; semantic retrieved (score 0.326). Not in official metrics |
| Keyword stuffing | diagnostic only | both retrieved (semantic score 0.595). Not in official metrics |
| Verbose evidence | diagnostic only | both retrieved (semantic score 0.380). Not in official metrics |

## Latency and usage

| Measure | Value |
| --- | --- |
| Embedding API calls | 5 |
| Retry count | 0 |
| Prompt tokens | 48 |
| Total tokens | 48 |
| Text units sent | 11 |
| Estimated USD cost | UNAVAILABLE. The evaluator records provider token counts and does not price them |
| Embedding latency | 7386 ms |
| Retrieval latency | 5 ms |
| Total runtime | 8914 ms |
| Provider failures | 0 |

## Fail-closed tests

Unit tests cover:

- missing API key → `NOT_RUN` / `LIVE_PRODUCTION_EMBEDDING_NOT_RUN`
- test override is not treated as live OpenAI configuration
- provider failure → `PARTIAL`
- timeout / abort → `PARTIAL`
- incomplete batch → `PARTIAL`
- dimension mismatch → `PARTIAL`

A test embedder that happens to return 1536-d vectors is labeled
`TEST_OVERRIDE_NOT_PRODUCTION` and is never a complete live gate.

## M10 design gate

The evaluator set `sufficientToDesign` true: live `text-embedding-3-small` was measured on the frozen synthetic set. M9 did not recover additional relevant applications. M9 introduced at least one labeled-not-relevant application. M9 did not miss a relevant application M8 found. Recall@10 difference was 0. Precision@10 difference was -0.1.

That is a measurement fact. It does not approve M10 implementation. The hybrid design document still requires every GO item before a measurement M10 may be considered, and this run did not implement hybrid retrieval.

## Limitations

- This record is a live measurement, not a claim that M9 beat M8
- Labels remain synthetic, not recruiter outcomes
- Dataset is small (5 official cases)
- No similarity threshold was introduced
- USD cost is UNAVAILABLE. Token counts came from the provider. Pricing is not pinned in this repository
