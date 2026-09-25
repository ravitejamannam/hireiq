# Live embedding evaluation gate (M9.1)

**Document state:** EVALUATION RECORD

This is not a product change. M8 and M9 retrieval semantics are unchanged.
M10 hybrid retrieval was not implemented.

## LIVE EMBEDDING EVALUATION STATUS

**NOT_RUN**

Status code: `LIVE_PRODUCTION_EMBEDDING_NOT_RUN`

Recorded at: `2026-09-25T15:36:59.885Z`

`OPENAI_API_KEY` was not configured in the evaluation environment. The gate
failed closed. `hash-projection-v1` was **not** substituted.

Re-run when a key is available:

```bash
pnpm eval:live-embeddings
```

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

| Metric | M8 | M9 live | Difference |
| --- | --- | --- | --- |
| Recall@10 | — | LIVE_PRODUCTION_EMBEDDING_NOT_RUN | — |
| Recall@25 | — | LIVE_PRODUCTION_EMBEDDING_NOT_RUN | — |
| Recall@50 | — | LIVE_PRODUCTION_EMBEDDING_NOT_RUN | — |
| Recall@100 | — | LIVE_PRODUCTION_EMBEDDING_NOT_RUN | — |
| Precision@K | — | LIVE_PRODUCTION_EMBEDDING_NOT_RUN | — |
| MRR | — | LIVE_PRODUCTION_EMBEDDING_NOT_RUN | — |
| NDCG@K | — | LIVE_PRODUCTION_EMBEDDING_NOT_RUN | — |

## Failure analysis

Not available. Official cases were not embedded by the production model.

Requested inspections and whether they exist in the frozen official set:

| Failure mode | In official frozen set | Live result |
| --- | --- | --- |
| React vs React Native | yes (`false-friend-react-native`) | NOT_RUN |
| Negated Django | yes (`negation-django`) | NOT_RUN |
| Sparse evidence | yes (`missing-evidence`) | NOT_RUN |
| Related Java vs Python | yes (`exact-python` app 2) | NOT_RUN |
| JS alias | yes (`alias-javascript`) | NOT_RUN |
| Python vs Django | diagnostic only | NOT_RUN |
| Java vs JavaScript | diagnostic only | NOT_RUN |
| PostgreSQL vs MySQL | diagnostic only | NOT_RUN |
| Keyword stuffing | diagnostic only | NOT_RUN |
| Verbose evidence | diagnostic only | NOT_RUN |

No similarity-score distribution is available. No threshold was chosen.

## Latency and usage

| Measure | Value |
| --- | --- |
| Embedding API calls | 0 |
| Retry count | 0 (M9 has no retry) |
| Prompt / total tokens | unavailable; API was not called |
| Estimated USD cost | not calculated |
| Embedding latency | 0 |
| Retrieval latency | 0 |
| Provider failures | 0; evaluation did not start |

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

**Not justified.**

There is no live `text-embedding-3-small` measurement. Offline hash-projection
results must not be used to decide hybrid retrieval.

After a `COMPLETED` live run, decide from complementarity and failure modes,
not from a single metric increase.

## Limitations

- This record is `NOT_RUN`, not a model-quality conclusion
- Labels remain synthetic, not recruiter outcomes
- Dataset is small (5 official cases)
- No similarity threshold was introduced
- Cost cannot be estimated without provider usage from a live call
