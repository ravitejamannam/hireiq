# HireIQ V1 QA Dataset

Canonical, deterministic fixtures for manual and scripted QA through **T66**.

Namespace: **V1QA**

Do not use this dataset in production. Do not commit generated database rows.

## Commands

```bash
pnpm qa:v1:seed
# or
npx tsx scripts/seed-v1-qa.ts
```

Idempotent. Deletes previous V1QA fixtures, deletes known old temporary QA fixtures (`QA Company Alpha/Beta`, `T58 Manual`, `TMP-T*`, `qa.*@hireiq.local`), then reseeds V1QA.

Reset **V1QA only** (does not touch Netflix / DDAI / OpenAi / `admin@hireiq.local`):

```bash
pnpm qa:v1:reset
# or
npx tsx scripts/seed-v1-qa.ts --reset
```

`--reset` never runs `prisma migrate reset` and never drops the database.

Shared password for every V1QA user:

```
V1QaPass123!
```

---

## Users

| Role | Name | Email | Portal |
|---|---|---|---|
| ADMIN | V1QA Admin | `v1qa.admin@hireiq.local` | `/dashboard` |
| CLIENT | V1QA Client Alpha | `v1qa.client.alpha@hireiq.local` | `/client` |
| CLIENT | V1QA Client Beta | `v1qa.client.beta@hireiq.local` | `/client` |
| INTERVIEWER | V1QA Interviewer Alpha User | `v1qa.interviewer.alpha@hireiq.local` | `/interviewer` |
| INTERVIEWER | V1QA Interviewer Beta User | `v1qa.interviewer.beta@hireiq.local` | `/interviewer` |

Interviewers are linked through `User.interviewerId` → `Interviewer`.

Clients are linked through `User.companyId` → `Company`.

Admin has no company and no interviewer profile.

Preserved non-fixture login (not part of V1QA): `admin@hireiq.local`.

---

## Companies

| Company | Purpose |
|---|---|
| V1QA Company Alpha | Primary end-to-end workflow |
| V1QA Company Beta | Tenant isolation / IDOR |

---

## Requirements

| Key | Title | Company | Interviewer | Lifecycle | SLA | Pipeline |
|---|---|---|---|---|---|---|
| A | V1QA Senior Backend Engineer | Alpha | Alpha | SOURCING_SHORTLISTING | Active (~20h remaining) | 4 CV_POOL, 1 EXPERT_REVIEW, 1 TECH_EVALUATION, 2 REJECTED |
| B | V1QA Data Engineer | Alpha | Alpha | SOURCING_SHORTLISTING | Not started (no due date) | 2 EXPERT_REVIEW |
| C | V1QA ML Engineer | Alpha | Alpha | SOURCING_SHORTLISTING | Overdue | 2 TECH_EVALUATION |
| D | V1QA Full Stack Engineer | Alpha | Alpha | SOURCING_SHORTLISTING | Approaching (~2h remaining, still ACTIVE in code) | 2 SHORTLISTED, 1 SELECTED |
| E | V1QA Staff Software Engineer | Alpha | Alpha | BILLING_GENERATED | Completed | 1 SHORTLISTED, 1 SELECTED, 1 HIRED |
| F | V1QA Company Beta Backend Engineer | Beta | Beta | SOURCING_SHORTLISTING | Active | 1 CV_POOL, 1 TECH_EVALUATION, 1 SHORTLISTED |

SLA note: product code only has `NOT_STARTED` / `ACTIVE` / `OVERDUE` / `COMPLETED`. “Approaching” is Requirement D with an ACTIVE due date two hours out.

Candidates are named `V1QA Candidate 001` … `V1QA Candidate 021`.

---

## Application distribution

| Status | Count | Where |
|---|---|---|
| CV_POOL | 5 | A: 001–004, F: 019 |
| EXPERT_REVIEW | 3 | A: 005, B: 009–010 |
| TECH_EVALUATION | 4 | A: 006, C: 011–012, F: 020 |
| SHORTLISTED | 4 | D: 013–014, E: 016, F: 021 |
| SELECTED | 2 | D: 015, E: 017 |
| HIRED | 1 | E: 018 |
| REJECTED | 2 | A: 007–008 |

Every application has `Candidate.companyId === Job.companyId === Application.companyId`.

---

## Evaluations and questions

Evaluations exist for EXPERT_REVIEW, TECH_EVALUATION, SHORTLISTED, SELECTED, and HIRED applications.

The evaluation interviewer is the requirement’s assigned interviewer (T63 uniqueness: one evaluation per application + interviewer).

Overall scores used for Client comparison: 72, 74, 81, 87, 93.

Recommendations: `HIRE`, `STRONG_HIRE`, `NO_HIRE`.

Fit: `RIGHT_FIT`, `NOT_FIT`.

Hire probability: `High`, `Medium`, `Low` (string field).

Questions are attached to shortlisted / selected / hired Alpha candidates and Beta 020/021.

---

## Billing

Billing exists **only** for the HIRED application on Requirement E.

| Record | Value |
|---|---|
| Requirement | V1QA Staff Software Engineer |
| Application | V1QA Candidate 018, HIRED |
| BillingRecord | status `PENDING` |
| BillingLineItem | one row, that application |
| Lifecycle | `BILLING_GENERATED` |

SELECTED applications 015 and 017 have **no** billing.

The Notification schema has no read/unread field. Two `INTERVIEWER_REQUIREMENT_READY` notifications exist (Alpha/A and Beta/F). T63 uniqueness is `jobId + interviewerId + type`.

---

## Test scenarios

### Scenario 1 — Admin overview

Login: `v1qa.admin@hireiq.local`

Open `/dashboard`. Confirm Alpha and Beta requirements, pipeline counts, and Operations → Billing.

**Expected:** Admin sees both companies. No Hire button on SELECTED cards. SELECTED shows “Awaiting client hire confirmation”. HIRED shows “Hire confirmed. Billing generated.”

### Scenario 2 — Client Alpha tenant isolation

Login: `v1qa.client.alpha@hireiq.local`

Open `/client/requirements`.

**Expected:** Only V1QA Company Alpha requirements. No Beta requirement, no Beta candidates.

### Scenario 3 — Client Beta tenant isolation

Login: `v1qa.client.beta@hireiq.local`

**Expected:** Only V1QA Company Beta Backend Engineer. No Alpha requirements.

### Scenario 4 — Interviewer Alpha workspace

Login: `v1qa.interviewer.alpha@hireiq.local`

**Expected:** Assigned Alpha requirements only. Cannot open Beta job F by URL (`/interviewer/requirements/{betaJobId}` → not found).

### Scenario 5 — CV Pool

Admin → Sourcing / Pipeline, Requirement A.

**Expected:** Candidates 001–004 in CV_POOL.

### Scenario 6 — Expert Review

Requirement B and Candidate 005 on A.

**Expected:** Expert review cards and scores visible. Interviewer Alpha can work those applications.

### Scenario 7 — Technical Evaluation

Requirement C (overdue SLA) and Candidate 006.

**Expected:** TECH_EVALUATION applications with evaluations/questions.

### Scenario 8 — Shortlist

Admin shortlist + Client Alpha shortlist on D and E.

**Expected:** SHORTLISTED candidates with evaluation scores. Client sees Select on SHORTLISTED only.

### Scenario 9 — Client evaluates shortlisted candidate

Client Alpha → Requirement D → Candidate 013/014.

**Expected:** Technical evaluation, scores, fit, hire probability, notes, questions.

### Scenario 10 — Client SELECTED

Candidate 015 (D) and 017 (E).

**Expected:** Status Selected. Confirm Hire is available. Copy says billing has not been generated.

### Scenario 11 — SELECTED has NO billing

Client Alpha → Billing, and Requirement D billing tab.

**Expected:** No billing row for D. E billing exists only because of HIRED 018, not because of SELECTED 017.

### Scenario 12 — Client confirms HIRED

On Candidate 017, Confirm Hire.

**Expected:** Status becomes HIRED. Admin still has no Hire action.

### Scenario 13 — HIRED generates billing

After confirming 017, or using seeded 018.

**Expected:** BillingRecord + BillingLineItem for that application. Requirement E lifecycle `BILLING_GENERATED`.

### Scenario 14 — Admin billing oversight

Admin → `/dashboard/billing`.

**Expected:** Staff Software Engineer billing, Alpha company, 1 hired candidate, View details. Status update/cancel available. No create-billing form.

### Scenario 15 — Billing detail

Admin `/dashboard/billing/{id}` and Client `/client/billing/{id}`.

**Expected:** Requirement, company, status, timestamps, hired line item for Candidate 018. Client cannot manage status.

### Scenario 16 — Cross-tenant IDOR attempt

From Client Beta, open Client Alpha billing id or Alpha requirement id.

**Expected:** `notFound`. Beta cannot see Alpha candidates 001–018.

Interviewer Alpha opening Beta requirement F: `notFound`.

### Scenario 17 — SLA normal / approaching / overdue

Admin requirements list / sourcing:

- A: Active, due ~20h
- D: Active, due ~2h (approaching)
- C: Overdue
- E: Completed
- B: Not started

### Scenario 18 — Evaluation / question detail

Client Alpha candidate 013 or 018, Interviewer Alpha evaluation workspace.

**Expected:** Scorecard, notes, recommendation, questions with answer / expert comment / score / difficulty / weight.

---

## Expected invariants

1. Alpha data never references Beta `companyId`, and the reverse.
2. SELECTED never has `BillingLineItem`.
3. Every HIRED application has exactly one `BillingLineItem`.
4. `BILLING_GENERATED` only on requirements with a HIRED application.
5. Admin does not confirm hire in the normal UI.
6. Client Alpha cannot access Beta billing by id.
7. Notification uniqueness `(jobId, interviewerId, type)` holds.
8. Evaluation uniqueness `(applicationId, interviewerId)` holds.

---

## Preserved non-QA data

The seed does **not** delete:

- Companies: Netflix, DDAI, OpenAi
- Interviewer: rajiv
- User: `admin@hireiq.local`
- Jobs: Devops Engineer, Backend engineer
- Candidates: Raviteja, Reddy
- Their interviews/reports

If a record cannot be matched to an explicit QA identifier, it is left untouched.
