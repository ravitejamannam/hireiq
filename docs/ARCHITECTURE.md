# HireIQ Architecture

> Multi-tenant hiring and recruitment operating platform.
> Evidence-first, transparent, developer-friendly.

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Database | PostgreSQL via Prisma ORM |
| Auth | NextAuth v5 (credentials provider) |
| Styling | Tailwind CSS v4 |
| AI | OpenAI (optional, job description + evidence extraction) |

## Quick Start

```bash
git clone https://github.com/ravitejamannam/hireiq.git
cd hireiq
pnpm install

cp .env.example .env
# Fill in DATABASE_URL, AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD

npx prisma migrate deploy
pnpm db:bootstrap-admin
pnpm db:seed-assessment-bank
pnpm db:bootstrap-dev

pnpm dev    # http://localhost:4000
```

## Core Philosophy

```
IDENTITY ≠ PROFILE ≠ EVIDENCE ≠ INTELLIGENCE ≠ MATCHING ≠ RANKING
                        ≠ ASSESSMENT ≠ HUMAN DECISION
```

These are separate domains. Never collapse them.

See [CONSTITUTION.md](./CONSTITUTION.md) for the full specification.

## Architecture Overview

```
                    COMPANY
                       │
                     JOB
              JOB SPECIFICATION (versioned, immutable once published)
                       │
              ┌────────┴─────────┐
        DISTRIBUTION         HOSTED APPLY (/apply/{token})
              │                  │ resume upload (PDF/DOCX/TXT)
              └────────┬─────────┘
                  APPLICATION
                       │
       ┌───────────────┼────────────────┐
       │               │                │
  ASSESSMENT       EVIDENCE          HUMAN REVIEW
  (MCQ, 48h)     (hashed, append-    (evaluations,
       │           only, traceable)   interviews, coding)
       │               │                │
  SCORE          INTELLIGENCE        EVALUATION
       │         (AI claims from      │
       │           evidence)           │
  LEADERBOARD          │          INTERVIEW / CODING
                       │                │
                   MATCHING             │
                 (deterministic V1)     │
                       │                │
                   RANKING              │
                 (skill coverage)       │
                       │                │
                       └────────┬───────┘
                                ▼
                         DECISION SUPPORT
                       (all signals, no composite)
                                │
                            SHORTLIST → CLIENT SELECT → HIRE → BILLING
```

### Key Invariants

1. **Evidence before intelligence** — no invented candidate facts
2. **Human decision separate** — machine output never auto-hires/rejects
3. **Traceable** — every decision traces to data (Application → MatchRun → Claim → Evidence → Source)
4. **Unknown ≠ False** — missing evidence is UNKNOWN, not NOT_SATISFIED
5. **Tenant isolation** — every query scoped by companyId from DB relationships, never browser input
6. **Historical immutability** — new information creates new versions/runs/snapshots

## Ticket History

| Range | Domain | Status |
|-------|--------|--------|
| T89 | Candidate Profile | ✅ |
| T90 | Candidate Identity | ✅ |
| T91 | Candidate Evidence | ✅ (T96 Phase 0 fixed ingest gap) |
| T92 | Candidate Intelligence (AI extraction) | ✅ |
| T93 | Candidate Matching | ✅ |
| T94 | Evidence Coverage Ranking | ✅ |
| T95 | Application Textual Evidence Capture | ✅ |
| T96 | Distribution Platform (Phases 0–5) | ✅ |
| T97 | Resume Upload (admin + public) | ✅ |
| T98 | Structured Interview Kit | ✅ |
| T99–T115 | Calibration, Scheduling Emails, Analytics, Onboarding, API v0, Calendar Sync, Notifications, DOCX, Status Page, Stage Emails, GDPR Export+Erasure | ✅ |

## Public API v0

```
Authorization: Bearer hireiq_{companyId}_{key}

GET /api/v1/jobs            Published roles with apply URLs
GET /api/v1/applications    Pipeline applications per job
GET /api/v1/candidates      Candidate records with skills/experience
```

Keys are created in the Integrations dashboard and shown exactly once.
Revocation is instant.

## Webhooks

Partners subscribe via `PartnerWebhookSubscription` to receive HMAC-SHA256
signed payloads on pipeline transitions (`application.status_changed`).

## Testing

```bash
# Full regression suite (29 checks against live server + DB)
bash scripts/az-regression.sh

# Typecheck + lint
npx tsc --noEmit
npx eslint lib app --max-warnings 0
```

CI runs all three on every push and PR (GitHub Actions).

## Security Model

| Concern | Implementation |
|---------|---------------|
| Auth | JWT session tokens (minimal payload; role + id only) |
| Tenant isolation | companyId derived from ACTIVE OrganizationMember, never browser input |
| Object ownership | Composite FK checks (candidateId + companyId), never bare-id lookups |
| Apply tokens | SHA-256 hash-only persistence; raw shown once |
| Assessment tokens | Same hash pattern; time-limited, single-use |
| Rate limiting | Per-IP and per-token on all public routes |
| Credential encryption | AES-256-GCM for stored secrets |
| PII protection | Public APIs return minimum necessary data; leaderboard is name + score only |

## Known Limitations

- Resume upload during hosted apply stores binaries locally (`.data/resumes/`);
  S3-compatible driver is a future seam.
- Assessment bank has no admin UI (seed-only); question randomisation not yet built.
- Email delivery requires `RESEND_API_KEY`; failures are logged but not retried.
- No automated unit test framework (regression suite is shell-based).
- Calendar OAuth sync code exists but needs Google Cloud credentials to activate.

---

*This document reflects the state of the codebase as of the latest commit.
For the governing product specification, see [CONSTITUTION.md](./CONSTITUTION.md).*
