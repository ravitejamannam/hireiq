# T83 Job Distribution

Provider-neutral distribution foundation. No live job boards. No applicant ingestion. Hosted apply URLs are minted by T84.

## T69 vs T83

T69 `SourcingDatabaseSource` (`LINKEDIN` | `NAUKRI`) is **database/access sourcing** for interviewers. Fields stay on Job:

- `sourcingDatabaseSource`
- `sourcingAccessDetails`
- `sourcingAccessReceivedAt`
- `shortlistingDueAt`
- `shortlistingCompletedAt`

T83 uses a separate `DistributionProvider` enum: `LINKEDIN` | `INDEED` | `NAUKRI` | `MANUAL`.

Do not reuse or expand `SourcingDatabaseSource`. `Application.source` is unchanged.

## Pinning

`JobDistribution.jobSpecificationVersionId` is set from `Job.currentPublishedSpecificationVersionId` at create time. The server ignores browser `specificationVersionId` and `companyId`. DRAFT versions and `aiProposedJobDescription` are never distributed. PUBLISHED versions remain immutable.

## Providers in T83

| Provider | Adapter | Network | Fabricates external IDs |
|---|---|---|---|
| MANUAL | ManualProvider | no | no |
| LINKEDIN | UnavailableProvider | no | no |
| INDEED | UnavailableProvider | no | no |
| NAUKRI | UnavailableProvider | no | no |

Live adapters are T86–T88 after partnership. T83 must work with all live connectors unavailable.

## Apply mode

- `EXTERNAL_URL` — stores an opaque `applyUrlSnapshot`
- `PROVIDER_NATIVE` — provider-owned apply (unavailable APIs fail publish)
- `HIREIQ_HOSTED` — T84 mints `{APP_URL}/apply/{token}` on publish. T83 does not create `/apply/...` itself.

## Credentials

`ProviderConnection` is Company-scoped. Secrets are AES-256-GCM via `HIREIQ_CREDENTIAL_ENCRYPTION_KEY`. Never stored on Job, JobSpecificationVersion, JWT, or returned to the browser.

If the encryption key is missing, connection create/update fails safely.

OWNER connects/disconnects. MEMBER may use an ACTIVE connection for distribution actions.

## Lifecycle

Distribution does **not** write `RequirementLifecycle`. Completing a requirement does **not** auto-distribute.

## T84 / T85

- T84: hosted apply URL
- T85: `ApplicationIngestionEvent`, webhooks, polling, expanding application attribution

T83 only provides stable `ProviderPosting` identity (`provider` + `externalPostingId`) for future ingestion. Webhooks must resolve posting → distribution → job → company, never a browser `companyId`.

## Idempotency

One non-CLOSED distribution per `(jobId, provider)`. Publish uses row locks. After an uncertain CREATE, retry FETCHes when the adapter supports it; Unavailable/Manual do not support fetch and must not blindly invent a second external listing.

## Limitations

- `LIVE_PROVIDER_NOT_TESTED`
- `AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED`
- Manual `fetchPosting` is unsupported
- LinkedIn / Indeed / Naukri publish always fails permanently in T83
