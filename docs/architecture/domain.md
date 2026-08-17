# HireIQ Domain Architecture

**Ticket:** T78 — Domain architecture freeze  
**Status:** Approved  
**Supersedes:** Informal T78 audit (2026-08-17)  
**Does not implement:** T79–T110

---

## 1. Purpose

This document freezes HireIQ’s domain ownership, tenancy, and architectural boundaries **before** T79–T110.

T78 is **not** a feature implementation. It does not add tables, migrate data, change Auth.js, change UI, introduce AI, or open job-board integrations.

The goal is to prevent avoidable restructuring: Company, User, Candidate, Application, and Job must not be redesigned by accident while distribution, intelligence, and evaluation layers are built.

If a later ticket needs to change a decision in this document, that change must be an explicit, approved architecture decision. Silent drift is not allowed.

---

## 2. Current architecture

HireIQ is a **modular monolith**.

| Layer | Current implementation |
| --- | --- |
| Web | Next.js 16 App Router |
| Mutations | Server Actions under `app/actions/` |
| Auth | Auth.js (`next-auth` v5) credentials provider, JWT session |
| Database | PostgreSQL |
| ORM | Prisma 6 (`prisma/schema.prisma`, client generated to `lib/generated/prisma`) |
| State rules | `lib/validation` (authoritative maps and asserts) |
| Job workflows | `lib/jobs` (T68 assignment lock, T69 sourcing handoff, T70 shortlist handoff) |
| Billing | `lib/billing` |
| Communication | `lib/communication` |
| Authorization | `lib/auth` (`requireUser` reloads the User row) |
| Reads | `lib/repositories` (portal-scoped queries) |

Portals:

| Portal | Route prefix | Gate |
| --- | --- | --- |
| Admin / ops | `/dashboard` | `requireAdmin()` in `app/dashboard/layout.tsx` |
| Client | `/client` | `requireClientPortal()` in `app/client/layout.tsx` |
| Interviewer | `/interviewer` | `requireInterviewerPortal()` in `app/interviewer/layout.tsx` |

There are no microservices, no Redis, no job queue, no pgvector, no object storage, no LiveKit, and no Judge0 in the current runtime. Email is an optional side effect (Resend) after a successful database commit.

`/signup` exists and refuses self-serve: accounts are Admin-provisioned today (`app/(auth)/signup/page.tsx`). Login is `/login`.

---

## 3. Current canonical domain models

Source of truth for fields: `prisma/schema.prisma`. This section does not invent columns.

### Company

- **Ownership:** Tenant root.
- **Purpose:** Named hiring client (industry, employee count). Product language may later say “Organization”; the Prisma model remains `Company`.
- **Relationships:** `users`, `jobs`, `candidates`, `billingRecords`, `notifications`.
- **Canonical:** Yes — this **is** the tenant.
- **Transitional:** Name is not unique; no slug; no membership table.
- **Future:** T79 adds membership **around** Company. Do not rename the model.

### User

- **Ownership:** Login principal. Optional `companyId` (Client) or unique `interviewerId` (Interviewer). Admin has both null.
- **Purpose:** Authentication identity (`email` unique, `passwordHash`, `role`).
- **Relationships:** `company?`, `interviewer?`.
- **Canonical:** Yes for authentication.
- **Transitional:** One `PortalRole` per user; no email verification; no invitations; multiple Clients per Company are allowed by schema but not productized.
- **Future:** T79 `OrganizationMember` around Company. User stays the auth principal.

### Job

- **Ownership:** `companyId`. Optional `assignedInterviewerId`.
- **Purpose:** Operational hiring requirement: lifecycle, assignment, SLA timestamps, plus current specification strings.
- **Relationships:** `company`, `assignedInterviewer?`, `applications`, `notifications`, `billingRecords`.
- **Canonical:** Yes for **operations**. Specification strings are transitional (T81).
- **Transitional:** `roleCategory`, `experienceRange`, `location`, `compensationRange`, `targetHireDate`, `numberOfPositions`, `mustHaveRequirements`, `niceToHaveRequirements`, `jobDescription`, `evaluationCriteria`, `primarySkills`, `sourcingDatabaseSource`, `sourcingAccessDetails` live on Job today.
- **Frozen on Job:** `requirementLifecycle`, `clientCompletedAt`, `sourcingAccessReceivedAt`, `shortlistingDueAt`, `shortlistingCompletedAt`, `assignedInterviewerId`, `companyId`, `status`.
- **Future:** T81 JobSpecification; T83 JobDistribution. Do not move operational fields.

### Candidate

- **Ownership:** `companyId` (company-scoped person stub).
- **Purpose:** Tenant-owned candidate record used by applications.
- **Relationships:** `company`, `applications`. Composite unique `@@unique([id, companyId])` for tenant FKs.
- **Canonical:** Yes as the company-scoped person. **Not** a global identity graph.
- **Transitional:** No email, phone, resume URI, or external ids. Profile-like fields (`role`, `experienceYears`, `location`, `currentEmployer`, `skills`, `expectedCTC`) sit on Candidate. `status` (`CandidateStatus`) is a **shadow** lifecycle.
- **Future:** T89–T92 profile / identity / evidence. Candidate remains company-scoped until a later explicit decision.

### Application

- **Ownership:** Denormalized `companyId` with composite FKs so `Candidate.companyId === Job.companyId`.
- **Purpose:** The **only** canonical Candidate ↔ Job relationship. Pipeline status, source, expert score, rejection reason.
- **Relationships:** `candidate`, `job`, `interviews`, `codingTests`, `reports`, `evaluations`, `billingLineItem?`. `@@unique([candidateId, jobId])`.
- **Canonical:** Yes — the hiring spine.
- **Transitional:** `source` is `SourcingDatabaseSource?` (`LINKEDIN` \| `NAUKRI` only).
- **Future:** Match, rank, assessment, interview engines, hire, and outcome all hang here. Ingestion metadata arrives in T85, not as provider-specific application models.

### Interviewer

- **Ownership:** Global. **No** `companyId`.
- **Purpose:** HireIQ domain expert (name, category, availability).
- **Relationships:** `assignedJobs`, `evaluations`, `notifications`, `users` (at most one User via `User.interviewerId` unique).
- **Canonical:** Yes as a global expert pool.
- **Transitional:** None required for tenancy. Assignment freeze after T68 is operational, not a tenancy change.
- **Future:** Do not attach Interviewer to Company.

### Evaluation

- **Ownership:** `applicationId` + `interviewerId` (`@@unique([applicationId, interviewerId])`).
- **Purpose:** Authoritative interviewer scorecard: overall score, JSON scorecard, notes, `recordingUrl` string, recommendation, hire probability, fit decision, `evaluatedAt`.
- **Relationships:** `application`, `interviewer`, `questions`.
- **Canonical:** Yes for current expert review.
- **Transitional:** `recordingUrl` is a string, not object-storage + consent.
- **Future:** T96–T104 evolve this system. Do not replace it in T78–T95.

### EvaluationQuestion

- **Ownership:** `evaluationId`.
- **Purpose:** Per-question prompt, answer, expert comment, score, difficulty, weight.
- **Canonical:** Yes as Evaluation children.
- **Future:** Assessment/interview rubrics may extend this pattern; do not fork a parallel question model without cause.

### Interview

- **Ownership:** `applicationId`.
- **Purpose:** Admin CRUD schedule row: `type`, `interviewAt`, `result`.
- **Canonical:** No — placeholder for T101 InterviewSession.
- **Transitional:** Yes. Keep until live interview infrastructure exists.
- **Future:** T101–T102.

### CodingTest

- **Ownership:** `applicationId`.
- **Purpose:** Admin CRUD score row: title, score, maxScore, status, `takenAt`.
- **Canonical:** No — placeholder for T99 Judge0 attempts.
- **Transitional:** Yes. Static `data/coding-tests.ts` is mock UI data, not this table.
- **Future:** T99. Do not execute candidate code in Next.js.

### Report

- **Ownership:** `applicationId`.
- **Purpose:** Admin CRUD recommendation + notes.
- **Canonical:** No — overlaps `Evaluation.recommendation`.
- **Transitional:** Yes. Likely fold into T104.
- **Future:** T104. Do not delete in T78.

### Notification

- **Ownership:** `jobId` (required), `companyId` (required), `interviewerId` (optional).
- **Purpose:** Workflow communication events, not a general inbox.
- **Types:** `INTERVIEWER_REQUIREMENT_READY`, `INTERVIEWER_DATABASE_READY`, `CLIENT_SHORTLIST_READY`.
- **Uniqueness:** `@@unique([jobId, interviewerId, type])`, `@@unique([jobId, companyId, type])`.
- **Canonical:** Yes for T68–T70/T76 events.
- **Transitional:** Event vocabulary will grow (ingestion, ranking, interview) without replacing T76 email semantics.
- **Future:** Additional types; keep commit-then-email and `emailDeliveredAt`.

### BillingRecord

- **Ownership:** `companyId`, `jobId` (indexed, **not** unique).
- **Purpose:** Requirement-scoped billing foundation. Status only. No amount, currency, or payment gateway.
- **Relationships:** `company`, `job`, `lineItems`.
- **Canonical:** Yes for hire billing.
- **Transitional:** Status machine is internal (`PENDING`, `READY`, `INVOICED`, `PAID`, `CANCELLED`). `PAID` is not a gateway settlement.
- **Future:** T106 must preserve T74/T77 guards. No `@@unique([jobId])` unless CANCELLED+new PENDING is explicitly forbidden later.

### BillingLineItem

- **Ownership:** `billingRecordId`, `applicationId` (`@@unique([applicationId])`).
- **Purpose:** One line per hired application. No fee fields.
- **Canonical:** Yes.
- **Future:** Pricing fields only when product defines them.

---

## 4. Canonical ownership model

```
Company                          Interviewer (global HireIQ expert)
 ├── Users                         ├── assigned Jobs
 ├── Jobs                          ├── Evaluations
 ├── Candidates                    └── User? (1:1 login)
 ├── BillingRecords
 └── Notifications

Job
 └── Applications

Candidate
 └── Applications

Application
 ├── Evaluation
 ├── Interview
 ├── CodingTest
 ├── Report
 └── BillingLineItem (when hired)
```

**Application is the canonical Candidate ↔ Job relationship.**

Job-specific state must hang from Application, including eventually: matching, ranking, assessments, interviews, evaluations, selection, hiring, and outcomes.

A Candidate may have many Applications (many jobs). Evaluation state must not be owned by Candidate as if it were job-agnostic.

Interviewer is **not** a Company child. Interviewers are HireIQ operators who can be assigned across tenants.

---

## 5. Tenancy model

**Company = tenant.**

| Actor | Scope |
| --- | --- |
| Admin | Global. No `companyId` required. |
| Client | `User.companyId`. Portal loads Company from DB (`requireClientPortal`). |
| Interviewer | Assigned-job scope (`Job.assignedInterviewerId` = `User.interviewerId`). |
| Candidate | Company-scoped (`Candidate.companyId`). |
| Application | `companyId` denormalized; composite FKs enforce Candidate and Job share that company (T64). |

Repository helpers in `lib/auth/authorization.ts` (`jobScopeWhere`, `applicationScopeWhere`, `candidateScopeWhere`, `billingScopeWhere`, `notificationScopeWhere`) implement these scopes. Admin bypasses tenant filters by design.

T78 does **not** change tenancy. T79 adds membership inside Company; it must not make Candidate globally shared and must not attach Interviewer to Company.

---

## 6. Authentication / authorization

### Authentication

- Provider: Auth.js credentials (email + password) in `auth.ts`.
- Session: JWT (`session.strategy = "jwt"`).
- Token payload on login: user `id`, `role`, `email`, `name`.
- Passwords: bcrypt (`User.passwordHash`). Never expose the hash to clients.
- User creation today: `scripts/bootstrap-admin.ts` and QA/seed scripts. There is no production signup action.

### Authorization source of truth

**JWT is not the authorization source of truth.**

`requireUser()` in `lib/auth/authorization.ts`:

1. Reads the session user id.
2. Reloads the `User` row from PostgreSQL.
3. Uses that row’s `role`, `companyId`, and `interviewerId`.

Browser-provided `companyId`, `interviewerId`, `role`, `tenantId`, or equivalent query params must not be trusted. Client pages already ignore tenant query params and derive company from session.

### Roles (`PortalRole`)

| Role | Meaning |
| --- | --- |
| `ADMIN` | HireIQ operator. Global. |
| `CLIENT` | Company hiring stakeholder. Requires `companyId`. |
| `INTERVIEWER` | HireIQ expert. Requires `interviewerId`. |

T79 will introduce organization **membership** without replacing this authentication architecture. User remains the login principal. Membership must be loaded server-side the same way: never from the browser.

---

## 7. Application state machine

Authoritative maps: `lib/validation/application-pipeline.ts`.  
Shared Admin assert: `assertAdminPipelineTransition` in `lib/validation/application-validation.ts` (used by both `updateApplication` and `transitionApplicationStatus`).

**`Application.status` is authoritative.**  
**`Candidate.status` is not.** It is a shadow enum (`APPLIED`, `INTERVIEWING`, `OFFER`, `HIRED`, `REJECTED`) still written by candidate CRUD and hardcoded `APPLIED` on sourced create. Do not delete it in T78. Deprecate in the ticket that introduces CandidateProfile / identity (T89+).

### Admin (operational pipeline)

```
CV_POOL
  ├── EXPERT_REVIEW
  └── REJECTED

EXPERT_REVIEW
  ├── TECH_EVALUATION
  └── REJECTED

TECH_EVALUATION
  ├── SHORTLISTED
  └── REJECTED

SHORTLISTED
  └── REJECTED

SELECTED   → (none)
HIRED      → (none)
REJECTED   → (none)
```

Create (`createApplication`) may only start at `CV_POOL`.

Admin **cannot** SELECT or HIRE. Generic CRUD uses the same map (T73).

### Interviewer (assigned job only)

```
TECH_EVALUATION
  ├── SHORTLISTED
  └── REJECTED
```

Interviewer **cannot** SELECT or HIRE. Conditional `updateMany` includes current status and `assignedInterviewerId`.

### Client (owning company only)

```
SHORTLISTED → SELECTED     selectClientCandidate
SELECTED    → HIRED        confirmClientCandidateHire  (+ billing in the same transaction)
```

Client SELECT/HIRE is **lifecycle-gated** (T77): Job must be `SOURCING_SHORTLISTING` or `BILLING_GENERATED`. T70 `shortlistingCompletedAt` is **not** a hiring gate.

Caller cannot supply `companyId` / `jobId` to escape scope. Concurrent SELECT/HIRE on the same application: one `updateMany` winner.

---

## 8. Requirement lifecycle

```
REQUIREMENT_DRAFTED
  → CLIENT_NOTIFIED
  → REQUIREMENT_POSTED
  → INTERVIEWER_NOTIFIED
  → SOURCING_SHORTLISTING
  → BILLING_GENERATED
```

`Job.status` (`OPEN` / `CLOSED` / `FILLED`) is operational display. It is not the hiring state machine.

### Dedicated writers

| Transition | Writer | Notes |
| --- | --- | --- |
| Create | `createJob` | Lifecycle must be `REQUIREMENT_DRAFTED`. |
| DRAFTED → CLIENT_NOTIFIED | `transitionJobLifecycle` | Only generic Admin skip that is actually allowed. |
| CLIENT_NOTIFIED → POSTED | `completeJobRequirement` | Admin, or Client on own company. Sets `clientCompletedAt`. Conditional `updateMany`. |
| POSTED → INTERVIEWER_NOTIFIED | `notifyAssignedInterviewer` | Admin. T68 in-app + email side effect. |
| INTERVIEWER_NOTIFIED → SOURCING_SHORTLISTING | `markJobSourcingAccessReceived` → `recordSourcingAccessHandoff` | Admin. Sets `sourcingAccessReceivedAt` and `shortlistingDueAt` (+24h). T69. |
| SOURCING_SHORTLISTING → BILLING_GENERATED | `generateBillingForHiredApplication` | Only from Client confirm-hire transaction. |
| Shortlist complete | `completeJobShortlisting` → `recordShortlistCompletionHandoff` | Admin or assigned Interviewer. Sets `shortlistingCompletedAt` only. **Does not change lifecycle.** T70. |

Generic `validateJobLifecycleTransition` **rejects**:

- CLIENT_NOTIFIED → POSTED (“completion workflow”)
- POSTED → INTERVIEWER_NOTIFIED (“notification workflow”)
- INTERVIEWER_NOTIFIED → SOURCING_SHORTLISTING (“database-access workflow”)
- SOURCING_SHORTLISTING → BILLING_GENERATED (“Billing workflow is not available yet”)
- Any other skip

### T72–T77 protections (lifecycle-related)

- T72: generic Job create/update cannot plant `clientCompletedAt`, `sourcingAccessReceivedAt`, `shortlistingDueAt`, `shortlistingCompletedAt`.
- T75: `assignedInterviewerId` cannot change to a different interviewer (or unassign) once lifecycle is `INTERVIEWER_NOTIFIED`, `SOURCING_SHORTLISTING`, or `BILLING_GENERATED`.
- T77: Client SELECT/HIRE and hire billing cannot jump DRAFTED/NOTIFIED/POSTED/INTERVIEWER_NOTIFIED → `BILLING_GENERATED`.

---

## 9. Billing architecture

```
Client CONFIRM HIRE
  SELECTED → HIRED          (updateMany, status predicate, company scope, lifecycle predicate)
  → BillingRecord           (reuse first non-CANCELLED for the job, or create PENDING)
  → BillingLineItem         (upsert on applicationId)
  → Job.requirementLifecycle = BILLING_GENERATED
```

All of the above commit in **one transaction** (`confirmClientCandidateHire` → `generateBillingForHiredApplication`). HIRED without billing cannot persist on this path.

| Rule | Implementation |
| --- | --- |
| Billing requires HIRED | Generator rejects non-HIRED. `createBillingRecord` calls `assertJobHasHiredApplicationForBilling`. |
| Hire and billing coupled | Same Prisma transaction. Failure rolls back HIRED. |
| Line item uniqueness | `BillingLineItem @@unique([applicationId])`. Repeat hire is idempotent. |
| One active record per job | `assertJobHasNoActiveBillingRecord` (status ≠ `CANCELLED`). Hire path `findFirst` non-CANCELLED + Job `FOR UPDATE`. |
| No `@@unique([jobId])` | **Intentional.** A CANCELLED record must not block a later PENDING record. Do not add uniqueness in T78. |
| Pre-sourcing hire billing | Rejected. Generator requires Job lifecycle in `SOURCING_SHORTLISTING` \| `BILLING_GENERATED`. |
| Amounts | None. Product has not defined fees. |

Leftover Admin `createBillingRecord` has no billing UI. Status updates: `updateBillingRecordStatus` / `cancelBillingRecord` (Admin). Transitions: `lib/billing/constants.ts`. Interviewers have no billing scope.

---

## 10. Communication architecture

```
Business transaction
  → database commit (Job / Notification)
  → email side effect
```

Workflow success is **DB commit + in-app Notification**. Email failure must not look like a rollback (T76).

| Field | Meaning |
| --- | --- |
| `Notification.emailDeliveredAt` null | Not delivered; retryable |
| `Notification.emailDeliveredAt` timestamp | Delivered; do not resend as a new success |

Retry: `retryNotificationEmail` / Admin `retryNotificationEmailDelivery`. Retry **does not** create a second Notification. Finalize helpers email only when `created === true` (idempotent in-app event).

Recipient is derived from the Job (assigned interviewer or owning company), not from caller-supplied email.

---

## 11. T72–T77 hardened invariants

These are frozen architecture constraints. Do not weaken tests or bypass them with generic CRUD.

| Ticket | Invariant |
| --- | --- |
| **T72** | Generic `createJob` / `updateJob` cannot plant workflow timestamps: `clientCompletedAt`, `sourcingAccessReceivedAt`, `shortlistingDueAt`, `shortlistingCompletedAt`. Only dedicated workflows write them. |
| **T73** | Generic Admin Application create is `CV_POOL` only. `updateApplication` and `transitionApplicationStatus` share `ADMIN_PIPELINE_TRANSITIONS`. Admin CRUD cannot enter `SELECTED` or `HIRED`. |
| **T74** | `createBillingRecord` requires at least one `HIRED` application on the job. Billing cannot be planted from CV_POOL / SHORTLISTED / SELECTED. |
| **T75** | After T68 (`INTERVIEWER_NOTIFIED` and later), interviewer assignment is frozen. Same-id assign is idempotent. Pre-notification reassignment remains allowed. |
| **T76** | Workflow state commits before email. Email is a side effect. Failures are retryable via `emailDeliveredAt`. Retry does not recreate the workflow Notification. |
| **T77** | Client SELECT/HIRE require Job lifecycle `SOURCING_SHORTLISTING` or `BILLING_GENERATED`. Generic Admin CRUD cannot plant hiring states. Hire billing cannot skip the requirement lifecycle. A second **active** BillingRecord is rejected. Hire and billing are transactionally coupled. HIRED and REJECTED are terminal for Admin/Interviewer. |

QA: `scripts/qa/workflow-13` through `workflow-18`, plus W01–W12 for earlier workflow.

Known limitation: `AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED` (no Auth.js request harness / Playwright). Do not fake authentication to claim E2E coverage.

---

## 12. Future domain evolution

Planning only. **Do not implement these in T78.**

| Ticket | Add / change |
| --- | --- |
| T79 | Organization membership around **Company**: members, invitations, verified domains. Do not rename Company. |
| T80 | Self-serve client onboarding (replace Admin-provisioned passwords). |
| T81 | `JobSpecification` (structured requirements; JD is a projection). |
| T82 | AI JD generator: propose, human approve, never silent publish. |
| T83 | `JobDistribution` + provider adapter boundary. |
| T84 | HireIQ hosted Apply (`/apply/[token]`, `ApplyToken`, `HostedApplySubmission`). See `docs/architecture/t84-hosted-apply.md`. |
| T85 | `ApplicationIngestionEvent` / ingestion gateway. |
| T86–T88 | LinkedIn / Indeed / Naukri / Wellfound adapters (capability-dependent; no scraping). |
| T89–T92 | `CandidateProfile`, `CandidateIdentity`, `CandidateEvidence`. |
| T93–T95 | `CandidateMatch`, `RankingSnapshot`, explainable ranking. Top-N is non-destructive. |
| T96 | Interviewer intelligence workspace (override AI with reason). |
| T97–T102 | Assessment blueprint, coding (Judge0), system design, LiveKit interview, interview evidence. |
| T103–T104 | Interview AI copilot (assistive); evaluation engine (auditable dimensions). |
| T105–T106 | Richer client shortlist; hiring/billing **preserving T77**. |
| T107–T108 | `HiringOutcome`; ranking feedback loop. |
| T109–T110 | Product acceptance; V1 release. |

Dependencies that must be respected: T81 before T93; T83 before T86; T85 before T90; T90 before T93; T92 before T94; T94 before T95; T96 before T97; T97 before T98; T99 before T101; T102 before T103; T107 before T108.

---

## 13. Job → JobSpecification boundary

**Not implemented in T78. Do not modify Job.**

| Stays on Job (operations) | Moves to JobSpecification in T81 |
| --- | --- |
| `requirementLifecycle` | `roleCategory` |
| `clientCompletedAt` | `experienceRange` |
| `sourcingAccessReceivedAt` | `location` |
| `shortlistingDueAt` | `compensationRange` |
| `shortlistingCompletedAt` | `targetHireDate` |
| `assignedInterviewerId` | `numberOfPositions` |
| `companyId` | `mustHaveRequirements` |
| `status` (`JobStatus`) | `niceToHaveRequirements` |
| `title` (operational display; spec title becomes canonical after T81) | `jobDescription` |
| | `evaluationCriteria` |
| | `primarySkills` |

`sourcingDatabaseSource` / `sourcingAccessDetails` stay on Job as T69 sourcing-access fields. They do **not** move to JobDistribution.

Matching, ranking, assessment blueprints, and JD generation must eventually read JobSpecification, not interpret raw JD text independently.

Until T81, those strings remain on Job. Dual-write/dual-read will be required at extraction time so T72–T77 and Job forms do not break.

---

## 14. Candidate intelligence boundary

**Not implemented in T78.**

Future conceptual stack (intra-company):

```
Candidate                 (company-scoped person)
  → CandidateProfile      (structured facts)
  → CandidateIdentity     (email/phone/external ids, confidence, merge review)
  → CandidateEvidence     (claim + source + span + confidence)
  → CandidateMatch        (Application-scoped)
  → RankingSnapshot       (Application-scoped, versioned)
```

Application remains the **job-specific spine**. Match and rank are per Application, not global Candidate scores that hide the job.

Identity resolution must not merge on name alone. Confidence: MATCH / PROBABLE / POSSIBLE / NO_MATCH. Current Candidate has no email or phone; T91 cannot ship until identity keys exist.

Never delete Candidates or Applications because they fall outside a top-N band.

---

## 15. Distribution boundary

T83 implemented a provider-neutral foundation. Details: `docs/architecture/t83-job-distribution.md`.

`sourcingDatabaseSource` / `sourcingAccessDetails` remain T69 database-access fields. They did **not** move to JobDistribution.

```
Job
  → published JobSpecificationVersion
  → JobDistribution
  → ProviderPosting
  → DistributionAttempt
```

Company owns `ProviderConnection`. No live LinkedIn / Indeed / Naukri adapters in T83.

**HireIQ will never scrape protected platforms** (including LinkedIn). Official integrations are eligibility- and contract-dependent. HireIQ must remain fully functional if a connector is unavailable.

Provider limitations must **not** change the canonical Application model. No `LinkedInCandidate`, `IndeedCandidate`, `NaukriJob`, or equivalent core tables.

---

## 16. Application ingestion boundary

Foundation for **T85**. Not implemented in T78.

```
Provider
  → Application Ingestion Gateway
  → Normalize
  → Validate
  → Deduplicate
  → Identity resolution
  → Candidate (company-scoped)
  → Application
```

Every ingestion event must be able to answer: source, time, external job id, provider, external application id, raw payload, normalization status, dedupe result, resolved candidate, created application, failure, retry.

Repeated ingestion must be idempotent. Provider-specific payloads stay in the ingestion record, not in core Candidate/Application columns.

---

## 17. Evidence-first AI architecture

**Not implemented in T78. No AI in this ticket.**

```
Source → Evidence → Feature → Match → Rank → Human decision
```

AI-generated claims must be grounded in CandidateEvidence (source, document, location/span, confidence). AI must not invent candidate facts. LLM-only ranking is forbidden as the entire system. Ranking should distinguish job-relevant signal from protected personal attributes; architecture must support audit and human review.

---

## 18. Human-in-the-loop

```
AI recommendation
  → expert / interviewer review
  → human decision + reason
  → outcome
```

AI does **not** replace the human hiring decision initially. Client remains the only role that SELECT/HIRE. Interviewer recommends through SHORTLISTED. Admin owns operational pipeline, not hiring.

This loop is also future training data (T108). Record AI suggestion vs human decision vs hire vs post-hire outcome when those tables exist.

---

## 19. Modular monolith boundaries

Target folders (create **only** when the ticket needs runtime code):

```
lib/domain/
  identity/      T79–T80
  jobs/          exists as lib/jobs (ops); T81 spec; T83 distribution
  candidates/    T85–T95
  hiring/        pipeline + SELECT/HIRE (today: actions + application-pipeline)
  billing/       exists as lib/billing
  evaluation/    T96–T104
  outcomes/      T107–T108
```

T78 does **not** create empty `lib/domain/` directories. Existing `lib/validation`, `lib/jobs`, `lib/billing`, `lib/communication`, `lib/auth`, and `lib/repositories` remain the current modules.

Extract real services only when scale, security isolation, or reliability requires it — not for diagrams.

---

## 20. Future infrastructure

**Planned, not implemented.**

| Now | When justified |
| --- | --- |
| PostgreSQL (source of truth) | pgvector (embeddings next to relational data) |
| Prisma | Object storage (resumes, recordings, artifacts) |
| In-process email after commit | Background queue |
| | LiveKit, Monaco, Judge0, Excalidraw |
| | OpenTelemetry-compatible traces/metrics |

Potential later: Redis, Temporal, Kafka, Kubernetes, separate services, dedicated search/vector infra.

**No premature infrastructure.** Do not add Redis, Temporal, or microservices in T78–T82. Do not execute candidate code in the Next.js server. Do not build WebRTC.

---

## 21. Architectural risks

Documented, not fixed in T78:

| Risk | Reality in repo |
| --- | --- |
| `Candidate.status` shadow lifecycle | Parallel enum; Application.status is authoritative |
| One Client user per company | Convention only; schema allows many Users per Company |
| No membership system | `User.companyId` only; signup disabled |
| Job contains specification fields | Listed in §13; extraction is T81 |
| No ingestion gateway | Admin sourcing / CRUD only; source enum is LINKEDIN \| NAUKRI |
| No candidate identity resolution | No email/phone/external ids on Candidate |
| No evidence engine | Skills are unstructured strings |
| No ranking engine | Pipeline order is operational, not scored rank |
| Placeholder evaluation models | `Interview`, `CodingTest`, `Report` are Admin CRUD |
| Public Apply attack surface | T84 hosted apply uses opaque hashed tokens; T85 ingestion is not implemented |
| P2 leftovers (T72–T77) | Admin application update-by-id lost-update; T75 assignment freeze TOCTOU; T76 concurrent email retry; `createBillingRecord` TOCTOU; `numberOfPositions` unenforced; generic `createApplication` is not sourcing-lifecycle-gated (SELECT/HIRE still are) |
| Auth.js actions | `AUTHENTICATED_SERVER_ACTIONS_NOT_INTEGRATION_TESTED` |
| `Company.name` | Not unique |
| Duplicate Admin pipeline copy | `RequirementWorkspaceClient` still has a local map (UI; server map is authoritative) |

---

## 22. T79 entry criteria

T79 may start only after **all** of the following are true:

- This T78 ADR exists (`docs/architecture/domain.md`).
- Company remains the tenant (no rename to Organization).
- Membership architecture is accepted: `OrganizationMember` (or equivalent) **around Company**, User remains login principal.
- Existing CLIENT users have a migration strategy (become owner/admin members of their `companyId` without breaking `requireClientPortal`).
- Admin remains global.
- Interviewer remains global (not a Company member by default).
- Email verification architecture is understood (verified email before create/join).
- Invitation architecture is understood (no Admin-invented passwords as the long-term path).
- Domain joining is configurable and **not** blindly trusted from an email suffix.

T79 must not: add JobSpecification, start Apply, add evidence/ranking, or weaken T72–T77.

---

## 23. T78 non-goals

T78 does **not**:

- Create a Prisma schema change or migration
- Refactor application logic
- Change authentication or authorization code
- Change UI
- Add AI
- Add job-board integration
- Add candidate intelligence models
- Add new infrastructure
- Create `OrganizationMember`, `Invitation`, `OrganizationDomain`, `JobSpecification`, `CandidateProfile`, `CandidateIdentity`, `CandidateEvidence`, `CandidateMatch`, or `RankingSnapshot`
- Start T79
- Delete `Candidate.status`
- Replace Evaluation, Interview, CodingTest, or Report

---

## 24. Final architecture freeze

These decisions are the architectural source of truth for T79–T110 unless explicitly superseded by a later approved architecture decision.

1. **Company remains tenant.** Product may say Organization; Prisma model stays `Company`.
2. **Interviewer remains global.** Do not attach Interviewer to Company.
3. **Candidate remains company-scoped.** Do not make Candidate globally shared in T79–T95 without a new ADR.
4. **Application remains the Candidate ↔ Job spine.** Job-specific state hangs from Application.
5. **Job keeps operational lifecycle.** T72–T77 timestamps, assignment, and `requirementLifecycle` stay on Job.
6. **No provider-specific core models.** Adapters wrap boards; core stays Candidate / Application / Job / JobDistribution.
7. **Ranking is non-destructive.** Top-N never deletes the rest of the pool.
8. **AI proposes; humans decide.** Client owns SELECT/HIRE. AI does not silently publish or hire.
