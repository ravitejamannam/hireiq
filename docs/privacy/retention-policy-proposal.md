# Retention policy proposal (draft, not approved)

This is a design proposal for review by the people who own privacy decisions. It is not legal advice and not a compliance guarantee. The numbers below are **proposed product defaults only. They are not universal legal requirements.** The right periods depend on jurisdiction, contracts and each customer's own obligations.

## Status and safety

- Expiry is **disabled in production**. The retention worker defaults to dry-run, and `execute` throws in production.
- Nothing here is applied by default. A company has no retention rule until one is configured with `retainDays`, a documented `basis`, and (for candidates) `closedStatuses`.
- Holds (`RetentionHold`, retained deletion decisions) always win over a rule.
- Rows are matched by category and the clock below, never by email address alone.

## Configuration shape (per company, per category)

| Field | Meaning |
|---|---|
| `retainDays` | Days after the clock starts. Absent means "keep, no rule". |
| `clock` | Which event starts the clock (see table). |
| `basis` | Written reason for the period. Required. |
| `closedStatuses` | Candidate statuses counted as closed. Required for candidate rules. |
| `enabled` | Defaults to false. Dry-run reports counts only. |

## Proposed starting points

| Item | Proposed default | Clock | Status |
|---|---|---|---|
| Incomplete applications (never submitted) | 30 days | last meaningful activity | Proposal |
| Unsuccessful applications | 180 days | closure | Proposal |
| Withdrawn applications | 180 days | withdrawal | Proposal |
| Assessment answers, grades, practical artifacts | 180 days | closure | Proposal |
| Integrity signals | 90 days | closure | Proposal |
| Embeddings and AI outputs | no longer than the candidate data they derive from | deletion of source | Proposal |
| Operational logs | 30 days, subject to security needs | log time | Proposal, held outside this repo |
| Minimized audit records | 365 days, subject to documented requirements | event time | Proposal. Separate from candidate data. |
| **Hired candidates** | **none** | n/a | **Unresolved. Needs a separate approved policy.** |

## Coverage of the 24 inventory categories

Numbers match `data-lifecycle-inventory.md`.

| # | Category | Proposal |
|---|---|---|
| 1 | Resume file | Same clock as the application (unsuccessful, withdrawn, incomplete). Object deleted and the result recorded as deleted, absent or failed. |
| 2 | Resume text | Same as 1. |
| 3 | Hosted application | Incomplete: 30 days from last activity. Submitted: follows the application outcome. |
| 4 | Ingestion event | Anonymised with the application. Row kept for counts. |
| 5 | Hosted uploads | Same as 1. |
| 6 | Profile | Same as the application. Photo object deleted with it. |
| 7 | Identity | Anonymised at expiry. Id kept so counts and audit stay consistent. |
| 8 | Application free text | Redacted at expiry. |
| 9 | Evidence | Same as the application. |
| 10 | Claims | Same as the application. |
| 11 | Quoted content in matching | Redacted at expiry. |
| 12 | Embeddings | Deleted no later than the evidence they come from. |
| 13 | AI outputs | Output cleared no later than the entity they describe. Job-level shared runs are kept. |
| 14 | Assessment answers and integrity | Answers and grades 180 days after closure. Integrity signals 90 days after closure. |
| 15 | Legacy assessment | Same as 14. |
| 16 | Practical submission and feedback | 180 days after closure. |
| 17 | Queued email content | Content removed when sent or cancelled. Unsent mail is cancelled at expiry. Untagged legacy rows follow the conservative rule in the erasure code and are listed as ambiguous when an address is shared. |
| 18 | Scheduling and interview evaluations | **Unresolved.** Evaluations are staff opinions about a person and may be needed for defence of decisions. A decision is needed on whether and how long to keep them. Notetaker content is proposed to follow the application. |
| 19 | Pending jobs | Cancelled or made no-ops at erasure. Workers recheck state before persisting or sending. |
| 20 | Audit | 365 days proposed for minimized records, subject to documented requirements. Existing rows that contain an email in the free-text reason cannot be edited because the table is append-only. |
| 21 | Erasure ledger | Step names only. Proposed to keep as evidence that erasure happened, on the audit clock. |
| 22 | Operational logs | 30 days proposed, set at the hosting provider. Not controlled in this repo. |
| 23 | Backups | **Unresolved.** Outside this repo. Needs an owner, a backup lifetime and a rule for re-applying erasure after a restore. |
| 24 | Provider copies | **Unresolved.** OpenAI, Resend and the storage provider hold their own copies under their own terms. Needs the providers' retention and deletion options confirmed. S3 versioned buckets keep old versions unless lifecycle rules remove them. |

Also unresolved: HRIS handoff payloads (`HrisHandoff.payload`), `Evaluation.recordingUrl`, and content hashes. Hashes of resume content can sometimes identify a known file. Whether to keep them for deduplication needs an approved decision.

## Decisions needed before any rule is enabled

1. Who approves the periods, and for which jurisdictions.
2. Hired candidates: what moves to employee records, what is deleted, and when.
3. Interview evaluations and HRIS payloads.
4. Backup lifetime and the restore procedure.
5. Provider retention settings.
6. Whether customers may set their own periods inside limits.

## Enabling later (not part of this change)

Each step is separate and reviewed: configure a rule for one test company, run dry-run and read the counts, review held and retained rows, then decide on execution outside production first. Production expiry stays off until the decisions above are recorded.
