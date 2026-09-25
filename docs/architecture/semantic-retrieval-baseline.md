# Semantic retrieval baseline (M9)

**State:** IMPLEMENTED

This is an independent recall-oriented retrieval experiment. It does not
replace M8 lexical retrieval, Matcher V2, the skill ontology, or ranking.

`semanticScore` is cosine similarity. It is not `candidateScore`, skill
equivalence, or a hire probability.

## Research question

Can semantic retrieval recover relevant applications that lexical retrieval
misses? M9 does not need to beat M8. It needs to be measurable against M8.

## Algorithm

`retrievalVersion`: `v1-semantic-embedding`

`method`: `semantic-max-evidence-cosine`

Query construction (`v1-structured-requirements`): the same structured Job
Intelligence terms used by M8. Not the raw job-description dump.

Representation (`v1-structured-query-evidence-text`):

- Job query text = `kind:sourceText` lines from the structured lexical query
- Candidate side = one embedding per eligible evidence record
- Application score = maximum cosine similarity across that application's
  eligible evidence
- Supporting evidence id is the evidence that produced the max score

Eligibility is identical to M8 and Matcher V2:

- `revokedAt IS NULL`
- `supersededById IS NULL`
- evidence is candidate-level or belongs to this application
- tenant-scoped by `companyId` at the data-access layer

## Embedding model

Preferred production path when `OPENAI_API_KEY` is set:

- provider `openai`
- model `text-embedding-3-small` (override with `OPENAI_EMBEDDING_MODEL`)
- 1536 dimensions
- batched, 64 texts per request

This model is used because OpenAI is already the optional AI provider in
HireIQ. It is a constraint of the current infrastructure, not a claim that it
is the best embedding model.

Tests and offline comparison use `hash-projection-v1` (32-d token hash). That
embedder is not a production quality model and must not be used to declare that
semantic retrieval wins.

No API key is hardcoded. Unconfigured environments fail closed.

## Why not pgvector

Local PostgreSQL 17 in this project has `plpgsql` only. Introducing pgvector
would add an infrastructure dependency that is not currently guaranteed on
every local and hosted environment.

M9 stores versioned vectors as JSON and computes cosine in-process after a
tenant-scoped fetch. That is acceptable for about 1,500 applications per job.

## Evaluation

M8 and M9 are compared on the same synthetic cases in
`lib/evaluation/retrieval-benchmark-dataset.ts`.

Labels remain `SYNTHETIC_NOT_RECRUITER_OUTCOMES`.

Metrics: Recall@10/25/50/100, Precision@K, MRR, NDCG@K.

Offline `hash-projection-v1` comparison is a test substitute only.

The M9.1 production gate (`pnpm eval:live-embeddings`) measures
`text-embedding-3-small` separately. If `OPENAI_API_KEY` is missing it fails
closed as `LIVE_PRODUCTION_EMBEDDING_NOT_RUN` and does not substitute
hash-projection. See
[live-embedding-evaluation.md](./live-embedding-evaluation.md).

## Known limitations

- High similarity is not skill equivalence (React vs React Native)
- Negated mentions can still retrieve ("no Django")
- Related-but-distinct technologies can confuse embeddings
- Offline hash-projection is a test stand-in, not a quality claim
- External OpenAI embeddings transmit redacted evidence text
- No hybrid fusion (that is M10)
- No reranking, LTR, or application status writes

## Cost

OpenAI `text-embedding-3-small` is billed per token. M9 batches requests and
skips unchanged `(source, content hash, model, normalization)` tuples. Storage
is JSON vectors, not a vector index. Measure actual spend before treating this
as production-scale infrastructure.
