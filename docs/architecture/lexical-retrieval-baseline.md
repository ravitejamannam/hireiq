# Lexical retrieval baseline (M8)

**State:** IMPLEMENTED

This is a recall-oriented retrieval baseline. It is not matching, reranking, or
a hiring recommendation.

## Algorithm

`retrievalVersion`: `v1-lexical-term-overlap`

Query construction (`v1-structured-requirements`):

- REQUIRED and PREFERRED skill nodes from Job Intelligence
- LOCATION hard constraints
- Not the raw job-description dump

Document side:

- Eligible `CandidateEvidence` only (`revokedAt` and `supersededById` null)
- Application-scoped or candidate-level evidence
- Never `CandidateProfile.skills`

Scoring:

- Unique positive canonical-term overlap
- Alias expansion via the existing ontology (JS → javascript)
- Longest-match false friends (React Native is not React)
- Negated mentions do not count as positive overlap
- Repeated keywords do not increase the score

Rank: `lexicalScore` desc, then `applicationId` asc.

Limit K is configuration. Default 100. Max 2000. Not 1,500 → 300.

## Known limitations

These are expected baseline weaknesses, not hidden defects:

- vocabulary mismatch and synonym blindness beyond the curated alias table
- no semantic understanding of context, seniority, or outcomes
- keyword stuffing is not rewarded, but neither is evidence quality
- sparse resumes are often not retrieved
- verbose resumes may still mention a required term once and retrieve
- terminology differences across companies
- location matching is literal normalized text
- applications with zero overlap are not retrieved; that is a recall miss
  this baseline cannot recover

Future retrieval methods must beat this baseline on labeled evaluation, not
aesthetics.
