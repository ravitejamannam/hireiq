# Candidate data lifecycle inventory

Scope: what HireIQ stores about a candidate, what erasure does to it, and what is left as a decision.
Model and field names were checked against `prisma/schema.prisma`. Erasure behaviour is in
`lib/privacy/candidate-erasure.ts`. Expiry is in `lib/privacy/retention-worker.ts`.

This is an engineering inventory. It is not legal advice and makes no compliance claim.

## Treatment key

- **Delete**: row or object removed.
- **Redact**: field emptied, row and non-personal structure kept.
- **Anonymise**: field replaced with a fixed placeholder.
- **Keep**: kept on purpose. Each keep has a reason below, and the open ones are in "Decisions needed".

Every candidate-scoped step carries `companyId`. Erasure takes `companyId` and `candidateId` together and refuses a mismatch.

## Inventory

| # | Category | Model / field (verified) | Tenant and candidate link | Storage | Derived or dependent copies | Behaviour before this pass | Treatment now | Jobs that could recreate it |
|---|---|---|---|---|---|---|---|---|
| 1 | Resume file | `CandidateResumeDocument.storageKey`, `CandidatePortalDocument.storageKey` | `companyId`, `candidateId` | Object storage (`RESUME_STORAGE_DRIVER` LOCAL or S3) | `extractedText`, `fieldSuggestion`, `fileName` | File deleted, errors swallowed, portal documents only on the deletion-queue path, `fieldSuggestion` and `fileName` kept | Text, suggestion and file name redacted first, then file deleted. A failed delete marks the step failed and retries. Key is kept until delete succeeds | Resume parse job, OCR queue (`ocr-queue.ts`) |
| 2 | Resume text | `CandidateResumeDocument.extractedText` | same | Postgres | `CandidateEvidence.inlineText`, embeddings | Nulled | Redacted. Row set to `parseStatus FAILED`, `parseErrorCode ERASED`, which removes it from the OCR queue and turns a late parse result into a no-op | Parse job, OCR |
| 3 | Hosted application | `HostedApplySubmission` (name, emailNormalized, phone, location, linkedInUrl, coverLetter, profilePayload) | `companyId`, linked by `ApplicationIngestionEvent.hostedApplySubmissionId` | Postgres | Evidence, identity signals | Anonymised | Anonymised (same) | None after submit |
| 4 | Ingestion event | `ApplicationIngestionEvent` (applicantName, applicantEmailNormalized, applicantPhone, applicantLocation, applicantLinkedInUrl, errorMessage) | `companyId`, `candidateId`, `applicationId` | Postgres | Source of the address used for candidate email | **Not erased** (gap) | Anonymised or nulled. This also stops candidate email, which reads the address from here | Provider ingestion |
| 5 | Hosted uploads | `HostedApplyResumeUpload`, `HostedApplyPhotoUpload` | `companyId`, via submission | Object storage + Postgres | `extractedText`, `fieldSuggestion` | Text nulled, photo rows left with keys | Text, suggestion, name redacted, files deleted | Hosted parse, OCR |
| 6 | Profile | `CandidateProfile` (all descriptive fields, `photoStorageKey`) | `candidateId` | Postgres + object storage | none | Redacted | Redacted, photo key cleared only after the file is deleted | Resume analysis |
| 7 | Identity | `Candidate` (name, currentEmployer, skills, location, expectedCTC), `CandidateIdentitySignal.normalizedValue`, `CandidatePortalIdentity`, `CandidateSelfIdentification` | `companyId` | Postgres | none | Signals and candidate fields done. Portal identity not removed | Candidate and signals anonymised. Portal identity rows deleted. Self-identification deleted | Hosted apply, rediscovery |
| 8 | Application free text | `Application.rejectionReason`, `withdrawReason`, `SpotCheck.note` | `companyId`, `candidateId` | Postgres | none | **Not erased** | Redacted. Status, codes and dates kept. Status link tokens cleared, application unsubscribed from email | Recruiter edits |
| 9 | Evidence | `CandidateEvidence.inlineText`, `contentSha256` | `companyId`, `candidateId` | Postgres | Claims, intelligence runs, embeddings, requirement assessments | Text nulled | Text redacted. Hash kept (see decisions). `createEvidence` now refuses an erased candidate | Parse job, hosted ingest, recruiter entry |
| 10 | Claims | `CandidateClaim.value`, `normalizedValue` | `companyId`, `candidateId`, `evidenceId` | Postgres | Requirement matches | Non-skill values replaced | Same. Skill claims are kept (a skill name is not about the person) | Intelligence job |
| 11 | Quoted candidate content in matching | `RequirementAssessment.citationQuote`, `overrideReason` | `companyId`, `candidateId`, `applicationId` | Postgres | none | **Not erased** (gap) | Redacted | Requirement-check job |
| 12 | Embeddings | `RetrievalEmbedding` (`sourceType` EVIDENCE, `sourceId` = evidence id, `vector`) | `companyId` only. Candidate reached through the evidence id | Postgres (Json) | none | **Not erased** (gap) | Deleted for every evidence id of the candidate in that company | Semantic retrieval run |
| 13 | AI outputs | `AIRun.outputJson`, `error`, `reviewerReason` | `companyId`, `entityType` + `entityId` | Postgres | none | **Not erased** (gap) | Output replaced with `{}` for runs on this candidate's evidence, assessment invites, practicals, hosted uploads, applications. `feature`, model, prompt version, token counts, `inputHash` kept | AI gateway calls (blocked for erased candidates) |
| 14 | Assessment answers and integrity | `GeneratedAssessmentInvite.answers`, `integrity`, `grades` | `applicationId` | Postgres | `AIRun` rows | **Not erased** (gap) | Answers emptied, integrity removed, `quote` removed from each grade, link token replaced and expiry set to the past. Scores, timestamps and item order kept | Grading |
| 15 | Legacy assessment | `AssessmentInvite`, `AssessmentAttempt.integritySignals`, `AssessmentAiExchange.body` | `applicationId`, `companyId` | Postgres | none | **Not erased** (gap) | Chat deleted, integrity signals removed, invite revoked. Answers and scores kept (see decisions) | none |
| 16 | Practical submission and feedback | `CodingTest.submissionText`, `submissionUrl`, `inviteTokenHash`, `PracticalCriterionScore.rationale`, `evidenceQuote` | `applicationId`, `companyId` | Postgres | `AIRun` | **Not erased** (gap) | Text, URL, link token, rationale and quote removed. Points, rubric keys, dates kept | Practical suggestion |
| 17 | Queued email content | `OutboundEmailAttempt` (to, subject, text, html) | **New** nullable `companyId`, `candidateId` set by `sendCandidateStageEmail` (assessment, practical, walkthrough, stage reminders) and by stage-change emails. **Not set** by booking confirmations (`scheduling-emails.ts`), rediscovery, portal sign-in or offer mail, so those rows stay untagged | Postgres | Provider copy (Resend) | **Not erased, no candidate link** (gap) | Tagged rows: content removed, `CANCELLED`, never retried. Retry sweep re-reads status before sending | Cron retry |
| 18 | Scheduling | `InterviewBookingInvite`, `InterviewReminder`, `NotetakerNote.quote`, `NotetakerConsent.participantEmail` | `applicationId` or `interviewId` | Postgres | Calendar event at provider | **Not erased** | Booking invite deleted, unsent reminders deleted, notetaker quotes deleted, consent email anonymised | Cron reminders |
| 19 | Pending jobs | OCR claim state, queued email, unsent reminders, in-flight grading and parsing | n/a | Postgres | none | Nothing stopped them | `Candidate.erasedAt` tombstone is set first. Parse, OCR and grading re-check it, evidence creation refuses it, AI policy returns `ERASED` | see above |
| 20 | Audit | `AuditLog` (actor, action, targetType, targetId, reason) | `companyId` | Postgres, append-only trigger | none | Kept | Kept. Rows hold ids, actions and short codes, not names or content. Erasure writes `CANDIDATE_ERASED` or `DELETION_COMPLETED` with status and counts only | n/a |
| 21 | Erasure ledger | `CandidateErasure` | `companyId`, `candidateId` | Postgres | none | did not exist | New. Step names and counts only | n/a |
| 22 | Operational logs | `console.*` in services, Vercel logs | none | Hosting provider | none | Not inspected | Outside this repo. Needs check | n/a |
| 23 | Backups | database snapshots | n/a | Database host | everything above | not in repo | Outside this repo. Erased data persists until backups age out | n/a |
| 24 | Provider copies | OpenAI (resume text, page images, answers), Resend (email), storage provider | n/a | Providers | | not in repo | Cannot be deleted from here. Needs contract and settings review (Part 4) | n/a |
| 25 | Inbound email linked to the candidate | `InboundEmailMessage.applicantName`, `emailMasked`, `applicantEmailNormalized`, `storageKey` | `companyId` and (`candidateId` or `applicationId` in this candidate's applications). Both ids are optional and have no foreign key | Postgres + object storage | Resume object at `storageKey` | **Not erased** | Redacted to `ERASED` / null. The object is deleted, then `storageKey` is cleared. A failed delete fails the `inbound-messages` step and leaves the key for retry. Status, code, provider event id, scan result, and counts stay | Inbound accept and `retryInboundEmailMessage` for rows this step cannot see |
| 26 | Import row linked to the candidate | `ApplicantImportRow.name`, `emailMasked`, `externalCandidateId` | `companyId` and (`candidateId` or `applicationId` in this candidate's applications). Both ids are optional and have no foreign key | Postgres | Spreadsheet bytes are not stored. A batch retry rebuilds only rows whose `code` is `ROW_FAILED` | **Not erased** | Name set to `ERASED`. Masked email and external id nulled. `status`, `code`, batch, row number, and both ids stay, so a batch retry does not rebuild the row | A later upload of the same file, after the match email has been removed |
| 27 | Decision rationale | `DecisionRecord.rationale` | `companyId` and `applicationId` in this candidate's applications. No foreign key to `Application` | Postgres | Distinct from append-only `AuditLog` | **Not erased** | Replaced with the fixed string `erased` by the `decision-rationales` step. Row id, deciding user, timestamp, and application id stay | `applyReviewDecision` can insert a new rationale after the step |

## Kept on purpose, narrow

- Candidate id, application statuses and dates, assessment and practical **scores and points**, rubric keys, interview structure, billing amounts. They describe the process, not the person. This was already the T114 position.
- `contentSha256` and `AIRun.inputHash`. A hash of candidate text can in principle be matched against a known text, so this is a decision item.
- Skill claims.
- `AuditLog` rows. Append-only by database trigger.
- `StageReminder` rows (outcome only).

## Decisions needed (not invented here)

1. **Retention periods.** No default exists. `retention.ts` has 180 and 1,460 days as talent-rediscovery windows only. The worker needs a per-customer rule with a documented basis for each category, and a list of which application statuses count as closed. Until then every category reports `NO_POLICY` and nothing expires.
2. **Hired candidates.** Employment records may need to be kept. The worker only expires candidates whose applications are all in the customer's closed statuses, so HIRED is never expired unless a customer lists it.
3. **Audit log.** Needs its own retention rule and a statement of who may read it. Its `reason` text is free text written by many call sites. A review of those writers for personal content has not been done.
4. **Scores and integrity signals.** Whether scores of an erased candidate may stay is a fairness-monitoring versus erasure question. Currently kept. Legacy `AssessmentAnswer` selections are also kept.
5. **Interview evaluations.** `Evaluation.notes`, `EvaluationQuestion.answer`, `recordingUrl` and `HrisHandoff.payload` are interviewer or HRIS records. Not erased in this pass. Needs a decision, because they may be hiring or employment records.
6. **Queue rows with no tenant.** Older `OutboundEmailAttempt` rows and system mail (portal sign-in links) have no `companyId`. Erasure counts rows that match the candidate's address and does not edit them, because the row has no owner to check. Decide whether recipient match alone is enough.
7. **Resume vision outputs.** Hosted parse records vision `AIRun` rows against the Job, so they cannot be tied to one candidate. Their output may contain page text. Needs a decision, or a code change to record the upload id.
8. **System actor for audit.** Resolved: the worker files `RETENTION_EXPIRED` rows with role `SYSTEM_RETENTION` and no user id (`actorUserId` is null). A failed audit write is logged and counted in the report's `failed`, because the erasure cannot be undone.
9. **Hash retention** (see above).
10. **Copilot text.** `CopilotMessage` has company and optional job only. `body` and `citations` can name a person, and one message can name several. There is no candidate or application column, so erasure does not delete or rewrite these rows.
11. **Re-import after erasure.** Once portal identities are deleted and ingestion emails are nulled, `decideIntakeMatch` can no longer see the erased address. A later spreadsheet or inbound message can create a new candidate. These three steps do not keep a suppression key.

## Still open after the linked-record steps

The `inbound-messages`, `import-rows`, and `decision-rationales` steps do not close the following:

- Inbound messages with neither `candidateId` nor an application id from this candidate. That includes `REVIEW`, `FAILED`, and `CANDIDATE_ERASED` rows that stored a name, address, or resume before an application existed. Erasure does not match those rows by name or email.
- Import rows with neither `candidateId` nor an application id from this candidate. A skipped erased match still writes `name` and `emailMasked` on a new row with both ids null. Erasure does not match those rows by name or email.
- A later upload or inbound message that creates a new candidate after the old email has been erased.
- `CopilotMessage.body` and `citations`. They cannot be attributed to one candidate. The existing 30-day company delete is separate from erasure.
- A decision inserted after `decision-rationales` runs. `applyReviewDecision` does not check `Candidate.erasedAt`, and a completed erasure is not retried for that new row.

## Retention worker (this pass)

- Default mode is **dry-run**. The cron route `/api/ops/retention` always runs dry-run and retries incomplete erasures that were already requested.
- `execute` exists, is covered by tests against a local database, and throws when `NODE_ENV` is production.
- A rule needs `retainDays`, a written `basis`, and for candidates `closedStatuses`. A bad rule is reported as `INVALID_POLICY` and treated as no policy.
- Holds: an open `RetentionHold`, or a `CandidateDeletionRequest` decided `RETAINED`, blocks expiry. The hold is re-read right before each erasure.
- Reports counts and category names only.
