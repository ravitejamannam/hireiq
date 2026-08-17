# T84 HireIQ Hosted Apply

Public candidate-facing apply surface. No Candidate/Application creation. No T85 ingestion.

## Authority

```
raw token → SHA-256 → ApplyToken.tokenHash → JobDistribution
  → Job + Company → pinned JobSpecificationVersion (PUBLISHED)
```

The browser never supplies `companyId`, `jobId`, `distributionId`, or `specificationVersionId` as authority.

## Token

- 256-bit base64url, SHA-256 at rest (`lib/auth/secure-token.ts`)
- Minted on successful `HIREIQ_HOSTED` publish
- Stored URL: `{APP_URL}/apply/{rawToken}` in `JobDistribution.applyUrlSnapshot`
- Revoked when the distribution is closed
- Existing token keeps the distribution pin if spec v2 is published later

## Submission

`HostedApplySubmission.status = RECEIVED` only. Unique:

- `idempotencyKey`
- `(distributionId, emailNormalized)` — **T84 anti-duplicate only**, not Candidate identity

T85/T91 own identity resolution and Application creation.

## Resume

Not implemented. No object storage/AV in this repository.

## Public DTO

Reuse T83 `buildPublicDistributionPayload`, then drop `applyMode` / `applyUrl`. Never expose evaluationCriteria, targetHireDate, structuredPayload, aiProposedJobDescription, or internal ids.
