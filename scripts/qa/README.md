# HireIQ full-workflow QA suite

Service/repository regression for the three-portal V1 workflow (T62–T71).

Does **not** invoke Auth.js server actions. This repo has no request-scope auth harness.

Does **not** include Playwright browser tests. Playwright is **not installed**.

## Missing for browser E2E (not installed)

Do not install without explicit approval:

- `@playwright/test`
- `playwright.config.ts`
- `e2e/` directory
- browser binaries (`npx playwright install`)

Until that exists, portal click-paths remain **manual** (see `scripts/V1-QA-README.md`).

## Commands

Requires V1QA seed:

```bash
pnpm qa:v1:seed
npx tsx scripts/qa/run-all.ts
```

Or:

```bash
pnpm qa:full
```

## Isolation

Every mutating workflow creates `TMP-FULL-QA-W0N*` jobs/candidates and deletes **only** those prefixes on the way out.

Never deletes:

- Netflix / DDAI / OpenAi
- `admin@hireiq.local`
- names matching rajiv / Raviteja / Reddy
- V1QA canonical fixtures

## Coverage map

| ID | Workflow | What is actually tested |
|----|----------|-------------------------|
| 01 | Requirement lifecycle | `validateJobLifecycleTransition`, T69 generic bypass blocked, Admin/Interviewer role predicates, source of `job-actions.ts` |
| 02 | Database access / SLA | Generic `INTERVIEWER_NOTIFIED`→`SOURCING_SHORTLISTING` rejected; `recordSourcingAccessHandoff` 24h SLA; one T69 |
| 03 | Evaluation | T63 uniqueness, `evaluationScopeWhere`, source of `saveInterviewerEvaluation` |
| 04 | Rejection | Admin vs Interviewer pipeline maps; REJECTED cannot SELECT/HIRE |
| 05 | Zero shortlist gate | `recordShortlistCompletionHandoff` reject then succeed |
| 06 | Communication idempotency | T68/T69/T70 create-once; email `provider-not-configured` |
| 07 | Client selection | Admin/Interviewer cannot SELECT; tenant-scoped SELECT; no billing |
| 08 | Hire + billing | `generateBillingForHiredApplication` once; SELECTED cannot bill |
| 09 | Admin hiring restriction | Server maps + source + Admin UI copy |
| 10 | Interviewer hiring restriction | Maps + source + `billingScopeWhere` |
| 11 | Tenant isolation | `jobScopeWhere` / `applicationScopeWhere` / IDOR findFirst both directions |
| 12 | Notification isolation | `notificationScopeWhere` Admin/Client/Interviewer |

## Auth limitation

`completeJobShortlisting`, `selectClientCandidate`, `confirmClientCandidateHire`, `saveInterviewerEvaluation`, and other `"use server"` actions require Next.js/Auth.js request scope.

This suite tests the **same production functions those actions call**, plus authorization predicates, plus source scans that the actions remain role-gated.
