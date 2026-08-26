# HireIQ Codebase Audit

> Two deep passes over every entry point: 25 API routes, 33 server-action
> files, all public token surfaces, money paths, and concurrency points.
> Findings below were verified in code and fixed with live verification.

## Pass 1 — found & fixed (`22e0049`)

| Severity | Finding | Fix |
|----------|---------|-----|
| CRITICAL | CSV export, offer letters, and GDPR erasure fetched by bare ID after role-only `requireAdmin()` — any admin could touch any company's data | All three now company-scoped; cross-tenant → 404 |
| HIGH | `ApiTokenManager` was display-only — create/revoke UI lost in an earlier rewrite; keys were curl-only | Full lifecycle restored via tenant-scoped server actions |
| MEDIUM | `/api/v1/sourced-candidates` duplicated intake logic inline; silently skipped provenance events so extension-sourced candidates never got stage emails | Single shared service; MANUAL ingestion events created in-transaction; email field added; verified end-to-end |
| MEDIUM | Integrations dashboard hardcoded `companyId: 1` everywhere | Derived from session |

## Pass 2 — found & fixed (this commit)

| Severity | Finding | Fix |
|----------|---------|-----|
| **CRITICAL** | Assessment invite tokens signed with `AUTH_SECRET \|\| APP_URL`. With AUTH_SECRET unset, the signing "secret" was the *public app URL* — anyone could forge invite URLs for any applicationId. CI always set AUTH_SECRET, so tests never caught it | Fail closed: no secret → no invites minted. Verified mint still works when configured |
| HIGH | Markup-billing CTC cap was ₹1 crore while the comment claimed ₹10 crore — legitimate senior placements would be rejected | Cap corrected to ₹10 crore |
| MEDIUM | Public write endpoints `POST /api/offer/[token]/accept` and `POST /api/schedule/[token]` had no rate limiting (apply/assess did) | Added per-IP limits (20/15m each); verified 429 fires on the 21st attempt |
| LOW | CRON_SECRET compared with `===` (timing side-channel) | Constant-time comparison via `timingSafeEqual` |

## Deliberate decisions (not bugs)

- **ProviderWebhookDelivery is global** inbound infrastructure with no
  company dimension — replay scopes by ADMIN role only. Documented on
  the service.
- **Stage-change emails are fire-and-forget** (`void promise`). In
  serverless runtimes these may be cut off after response. Acceptable
  for the current single-node deployment; revisit with
  `after()`/queues on serverless hosts.

## Structural strengths confirmed

- Race safety: guarded `updateMany` slot claims, `FOR UPDATE` billing
  serialization, unique-constraint upserts for idempotent apply.
- Token hygiene uniform: hash-at-rest, raw-shown-once, constant-time
  compare (apply, assessment, API keys, offers).
- Fail-open notification design: email/webhook failures never block or
  roll back pipeline transitions.
- Cascade policy: Restrict by default (101 relations), Cascade only on
  candidate-owned PII tables (3) — erasure cannot orphan tenants.

## Known remaining limitations

1. Resume binaries stored on local disk (`.data/resumes/`) — S3 seam
   exists but not implemented. Production blocker.
2. Zero unit tests; regression coverage is shell-based E2E only.
   Money math, adaptive selection, and scoring deserve table-driven
   unit tests.
3. Local dev DB has migration-checksum drift from the history repair;
   use `prisma migrate deploy` (CI path) until a deliberate reset.
4. Fire-and-forget email delivery (above).

*Last full audit: this commit. Re-run after any new public surface.*
