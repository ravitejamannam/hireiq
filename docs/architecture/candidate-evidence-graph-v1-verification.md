# Candidate Evidence Graph V1 — Integration & Surface Verification

**Milestone:** Phase 5.1  
**Date:** 2026-09-25  
**M10_IMPLEMENTED = NO**

## 1. Scope

Verification and hardening only. No new graph relationship types. No M8/M9
changes. No hybrid retrieval. No `candidateScore`. No application-status writes.

Closed the two previous UNKNOWN gaps:

1. Two-company database fixtures through the actual materialize/load boundary.
2. Browser/admin surface on a running app.

Final closure of the remaining documented gaps:

1. Live Auth.js Interviewer session against the graph URL: VERIFIED denied.
2. Clean standalone `tsc --noEmit` after Next was stopped: VERIFIED.

## 2. Environment

- Local Next.js `pnpm dev` on `http://localhost:4000`
- PostgreSQL `hireiq` via existing `DATABASE_URL`
- Prisma client already generated; no schema change in this milestone
- Demo identities used: `admin@hireiq.local` (ADMIN),
  `owner.nimbus@hireiq.local` (CLIENT),
  `interviewer.arjun@hireiq.local` (INTERVIEWER)
- Interviewer live login used the existing credentials callback + cookie jar
  pattern from `scripts/az-regression.sh` against `localhost:4000`. No new
  authorization model was added.
- Ephemeral two-company Vitest fixtures were created and deleted
- Ephemeral browser company `egv1-browser-verify` was created, used, and deleted

## 3. Two-company test setup

Harness: `lib/evidence-graph/evidence-graph-isolation.integration.test.ts`

Each tenant received: Company, Job, published spec, Candidate, Application,
CandidateEvidence, CandidateClaim, JobIntelligence requirement, Matcher V2
assessment citing that claim/evidence.

The test calls the same functions the server actions use after auth:

- `executeMaterializeEvidenceGraph`
- `loadEvidenceGraphPage`
- company-scoped repository loaders

Session `requireAdmin()` is not callable in Vitest (Auth.js). Role denial uses
the same predicate the action uses: `isAdminEvidenceGraphRole`.

Existing architecture: Admin is platform-global (`requireAdmin` does not bind
`companyId`). There is no Company-A-admin vs Company-B-admin. That is not
invented here.

## 4. Server-action results

| Check | State | Notes |
| --- | --- | --- |
| Materialize A yields only A edges | VERIFIED | No B evidence/claim/requirement/assessment IDs |
| Materialize B yields only B edges | VERIFIED | Symmetric |
| Load A job page excludes B runs | VERIFIED | `loadEvidenceGraphPage` |
| Load B job page excludes A runs | VERIFIED | |
| A job + B spec | VERIFIED | `EVIDENCE_GRAPH_NOT_FOUND` |
| `listEvidenceGraphRunsForJob(jobA, companyB)` | VERIFIED | empty |
| `getEvidenceGraphRunWithEdges(runA, companyB)` | VERIFIED | null |
| Evidence/claim loaders with cross-tenant IDs | VERIFIED | empty |
| Auth.js `getEvidenceGraph` / `materializeEvidenceGraph` with a live session cookie | NOT_TESTED | Vitest cannot construct Auth.js sessions; browser used the admin UI instead |

## 5. Role results

Actual rules (not inferred):

- Graph get/materialize: `requireAdmin()` then `isAdminEvidenceGraphRole` → **ADMIN only**
- `/dashboard/*`: Auth.js redirects CLIENT to `/post-auth`/`/client`, INTERVIEWER to `/interviewer`
- Client portal pages do not mount `EvidenceGraphPanel`

| Actor | Graph operations | State |
| --- | --- | --- |
| ADMIN | Allowed | VERIFIED (helper + live admin UI) |
| CLIENT | Denied | VERIFIED (helper + live redirect/404) |
| INTERVIEWER | Denied | VERIFIED (helper + live Auth.js session) |

Company-scoped Admin isolation: **UNKNOWN / not in architecture**. A platform
Admin can open any job ID. Data still does not mix tenants inside a job load.

## 6. Browser results

App started with `pnpm dev` after an initial sandbox failure
(`uv_interface_addresses`). Retry outside the sandbox succeeded.

| Check | State | Notes |
| --- | --- | --- |
| Requirement workspace loads | VERIFIED | `/dashboard/requirements/1` and `/51` |
| Evidence Graph panel renders | VERIFIED | Heading + diagnostic copy |
| Empty graph state | VERIFIED | Job 1: runs exist, “No derived relationships.” Job 7: “No evidence-graph snapshots” |
| Populated graph | VERIFIED | Job 51 fixture: all six V1 edge types |
| Claim → evidence provenance | VERIFIED | `candidate_claim#3.evidenceId · evidence #400` |
| Requirement relationships | VERIFIED | `REQUIREMENT_REQUIRES_SKILL`, `CLAIM_CITED_FOR_REQUIREMENT` |
| Revoked evidence Lifecycle A | VERIFIED | Historical rows remain; `(inactive)` after revoke |
| Unauthorized / unauthenticated | VERIFIED | Logged-out graph URL → `/login`. Client hitting `/dashboard/requirements/51` → `/client` |
| Other-company client access | VERIFIED | Nimbus client + Harbor Pay `/client/requirements/7` → 404. Client page has no graph panel |
| No hidden `candidateScore` | VERIFIED | Absent on job 1 and job 51 |
| M8/M9/T94 remain distinct | VERIFIED | Separate headings and copy |
| Graph view does not change status | VERIFIED | Fixture stayed `CV_POOL`; job 1 statuses unchanged when materialized |
| Interviewer live UI | VERIFIED | Live `INTERVIEWER` session: `GET /dashboard/requirements/1` and `/51` → `302 /interviewer`. Followed body had no graph heading, materialize control, or edge types. `EvidenceGraphRun` / `EvidenceGraphEdge` counts unchanged (0 → 0). Interviewer home `200`. |
| Pre-existing hydration overlay | PARTIAL | `DistributionKit.tsx` React hydration warning appeared; graph still rendered. Not a graph defect. Not fixed |

## 7. Historical lifecycle results

| Step | State |
| --- | --- |
| Active evidence → edge exists and traces to evidence | VERIFIED (integration + browser) |
| Revoke → historical row remains, `evidenceActive` false / `(inactive)` | VERIFIED (integration + browser) |
| Supersede → historical row remains, `evidenceActive` false | VERIFIED (integration only; browser used revoke) |

Lifecycle A was not changed.

## 8. Tenant-isolation results

| Layer | State |
| --- | --- |
| Engine / company-scoped loaders | VERIFIED (prior + this milestone) |
| Two-company DB through materialize/load | VERIFIED |
| Cross-tenant ID lookups | VERIFIED |
| Platform Admin can open another company’s job | VERIFIED as existing semantics (Harbor Pay job 7). Not a data leak across jobs |
| Live Auth.js server-action cookie isolation | NOT_TESTED |

## 9. Bugs discovered

1. `pnpm dev` fails in a restricted sandbox (`uv_interface_addresses`). Not an
   application defect.
2. Pre-existing `DistributionKit` hydration warning on the requirement
   workspace. Graph panel still rendered.
3. Graph server actions depend on Auth.js session, so Vitest cannot call the
   `"use server"` wrappers directly. Harness uses the post-auth functions those
   wrappers call.

No graph isolation defect was found that required an architectural change.

## 10. Bugs fixed

None. No authorization semantics were broadened.

Smallest harness added:

- `lib/evidence-graph/evidence-graph-operations.ts` — session-free
  materialize/load used by the service after `requireAdmin`
- Integration test + local env loader for `DATABASE_URL`

## 11. Tests run

- `pnpm exec vitest run lib/evidence-graph/evidence-graph-isolation.integration.test.ts` — 5 passed
- Full `pnpm test` after this milestone (see completion block)
- `pnpm exec tsc --noEmit` after `pnpm dev` was stopped and port 4000 had no
  listener: exit 0
- Full `pnpm test`: 26 files, 118 tests passed
- `git diff --check`
- `pnpm exec prisma validate`: schema valid

## 12. Remaining UNKNOWN / NOT_TESTED items

- Live Auth.js cookie calling `app/actions/evidence-graph-actions.ts` directly
  remains **NOT_TESTED**. Interviewer denial was verified at the application
  boundary (`proxy.ts` / `auth.config.ts` `authorized` callback) before the
  graph page or action runs. A raw server-action POST was not invented.
- Browser supersede path remains **NOT_TESTED** (revoke path was used instead)
- M9.1 remains `NOT_RUN` (OpenAI key unavailable; out of scope)
- M10 remains `NOT_APPROVED`

Closed in this final verification pass:

- Live Interviewer Auth.js session against the admin graph URL: **VERIFIED**
- Clean standalone `tsc --noEmit` with Next stopped: **VERIFIED**

A first `tsc` run after the original `pnpm dev` stop failed only in leftover
generated `.next/dev/types/validator.ts` (truncated line 40 `ute>)`). That file
was not edited by hand. Next was started with the documented `pnpm dev` command
until the generated validator was complete, then stopped again. The second
`tsc --noEmit` with no listener on port 4000 exited 0.

## 13. Explicit verification labels

Admin is platform-global in this architecture; company isolation is enforced
on data, not by inventing a company-bound Admin.

| Label | State |
| --- | --- |
| SERVER_ACTION_TENANT_ISOLATION | VERIFIED (two-company post-auth materialize/load; live action-cookie POST still NOT_TESTED) |
| ROLE_BOUNDARIES | VERIFIED |
| ADMIN_MODEL | PLATFORM_GLOBAL |
| BROWSER_SURFACE | VERIFIED |
| HISTORICAL_LIFECYCLE | VERIFIED |
| SECURITY_QUERY_REVIEW | VERIFIED (company-scoped loaders; cross-tenant IDs empty/null) |
| TYPESCRIPT | VERIFIED |

ROLE_BOUNDARIES detail:

- Admin: existing platform-global behavior
- Client: verified denied
- Interviewer: live-auth denied (`302 /interviewer`; no graph data; no mutation)
