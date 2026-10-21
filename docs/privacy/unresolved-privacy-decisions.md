# Unresolved privacy decisions

Status: open. Nothing here has been deleted, shortened or given a retention period. Each item names what exists today, the risk, and the decision a person must make. This is not legal advice.

The retention worker is unchanged: dry-run by default, `NO_POLICY` for any company or category with no rule, and `execute` throws in production.

## 1. Legacy untagged queued email

- **Today.** Rows created before `OutboundEmailAttempt.companyId` and `candidateId` existed have no owner. Erasure handles them by address: if no other live candidate, submission or portal identity uses the address, the row is cancelled and its content removed. If someone else shares the address, unsent rows are cancelled, content is left, and the row is counted as `legacyEmail.leftAmbiguous`.
- **Risk.** Ambiguous rows keep the erased person's message content. A shared address (family, agency, shared mailbox) cannot be resolved by the system.
- **Decision needed.** Who reviews ambiguous rows, and how soon? Should all legacy rows older than a set age be sanitised without review, and if so after how many days?

## 2. Staff email

- **Today.** Mail to recruiters and interviewers is untagged by design. Booking mail to an interviewer is tagged to the candidate it concerns, so it is cancelled with that candidate. Other staff mail (digests, alerts) can still name candidates in its body.
- **Risk.** A staff message can quote candidate details and sit in the queue or provider logs.
- **Decision needed.** Whether staff mail may name candidates at all, and a retention period for staff mail content.

## 3. Audit free-text fields

**Update.** The nine portal sites no longer write the address. They write `via candidate portal` (plus `| reason given` or `| kind <kind>`). `writeAuditLog` also masks any email address that reaches it as `[email]`. Grade-override, spot-check, close-out and deletion-retained audit rows now keep outcomes and counts only, and the free text stays on its own record, where erasure can reach it (the grade override reason is now cleared at erasure). **Not changed:** the staff-entered rejection reason is still copied into the `APPLICATION_REJECTED` audit row (an existing test asserts it), and the AI-preference attestation text is still copied into its row. Those two need an owner decision. Rows written before this change are untouched: rewriting them needs the separate policy in (b) below.

- **Today.** `AuditLog` is append-only. Portal actions in `lib/portal/portal-service.ts` write the candidate's email address into `reason` (about nine call sites). Rows already written cannot be edited. New rows still carry the address.
- **Risk.** The audit table holds email addresses that erasure cannot reach. This is the largest remaining personal-data gap in a store the system itself treats as permanent.
- **Decision needed.** (a) Stop writing the address and use an opaque reference (a code change, not made here because audit content is a decision for the owner). (b) Whether existing rows may be pseudonymised, which means changing the append-only rule. (c) The audit retention period (365 days is only a proposal).

## 4. Interview evaluations

- **Today.** `Evaluation` rows hold interviewer opinions and ratings about a named person. Erasure does not remove them.
- **Risk.** They are personal data. They may also be the only record explaining a hiring decision, which an employer may need to keep.
- **Decision needed.** Whether evaluations are erased with the candidate, kept for a defined period, or kept in anonymised form. This is a product and legal choice, not a technical one.

## 5. HRIS handoff payloads

- **Today.** `HrisHandoff.payload` stores what was sent to a customer's HR system. Erasure does not remove it.
- **Risk.** It duplicates identity fields. For hired candidates the HR system may now be the record of authority.
- **Decision needed.** Whether the payload is kept at all after a successful handoff, and what happens for a hired candidate who asks for erasure. This links to the unresolved hired-candidate policy.

## 6. Recording URLs

- **Today.** `Evaluation.recordingUrl` points at a recording held by an external provider. Erasure does not clear the link or ask the provider to delete.
- **Risk.** The link can stay reachable after erasure. Deleting the link alone does not delete the recording.
- **Decision needed.** Which provider holds recordings, whether deletion can be requested by API, and who confirms it. Until then the link is the only handle we have, so clearing it without deleting the recording would lose track of the copy.

## 7. Other open items from the inventory

- Hired candidates: no rule. Needs its own approved policy.
- Backups: lifetime and restore-time re-erasure are not defined.
- Provider copies (OpenAI, Resend, storage provider, S3 versioned buckets): retention and deletion options are not confirmed.
- Content hashes: whether they are personal data for this product, and whether to keep them for deduplication.
- Retrieval snapshots: see section 8.
- `Job`-level AI runs such as copilot questions: a recruiter could type a candidate's name into a question. These runs are attached to the job, not a candidate, so erasure cannot find them by id. Decision needed on retention of copilot question text.
- Unused AI entry points (`lib/outreach/sequences.ts`, `lib/assessments/ai-use-policy.ts`, `lib/interviews/notetaker.ts`) take the run's entity from the caller. No production caller exists today. Any future caller must pass a candidate-linked entity type that `candidateIdForAiEntity` knows, or its runs will not be erased.

## 8. Retrieval snapshots after erasure (ranks and scores)

**What is kept after a candidate is erased.** In `LexicalRetrievalResult`, `SemanticRetrievalResult` and `HybridRetrievalResult`: `candidateId`, `applicationId`, `rank`, the score (`lexicalScore`, `semanticScore`, `rrfScore`), the lexical and semantic ranks for the hybrid row, the method or fusion version, and `createdAt`. Cleared: `matchedTerms` (words taken from the candidate's text) and `supportingEvidenceId` (a link to evidence that erasure also wipes). The run rows (`*RetrievalRun`) hold no candidate content. They keep counts, versions, a query hash and an evidence-snapshot hash.

**Is it still identifiable?** It is pseudonymous, not anonymous.
- Nothing in these rows names the person. The candidate row is renamed `Erased Candidate #<id>`, and email, phone and free text are gone.
- The ids still link the row to the retained application row, which keeps the job, status, dates and decision codes, and to any outcome events. Anyone holding another copy (a backup, an earlier export, a provider log) can re-link by id.
- A rank and score for a specific application on a specific job is information about how that person was assessed. Where a job has few applicants, the application id plus the job and date is enough to single someone out inside the tenant.

**Why the rows are kept now.**
- Deleting a row would change the rank positions and `retrievedCount` of other candidates in the same run. That would make a run that other people were judged by unexplainable.
- They back the decision-support view (`decision-support-service`) and the fairness and funnel counts. The retention worker has no category for them yet.
- Nothing was deleted speculatively. The treatment below is a proposal and is not enabled.

**Policy decision needed (owner: privacy lead with the product owner).** Pick one:
1. **Keep for the life of the job's decision record.** Ranks and scores stay while the application row stays. Simple, and it keeps runs explainable, but it keeps a score about an erased person indefinitely.
2. **Expire with the application.** Delete the snapshot rows when the application's own retention period ends (the 180 days after closure proposal). Other candidates' ranks in a run would then be recomputed from the remaining rows, or the run marked as no longer reproducible.
3. **Remove the person's rows at erasure and mark the run as altered.** Strongest for the erased person. Gives up exact reproducibility of old runs, and needs a rule for what the product shows about an altered run.

Also needed: whether a score counts as a decision input that the employer must be able to explain, which is a legal question, not a technical one.

**What this change did not do.** No retention rule was added for these tables, `retention-worker.ts` is untouched, and no historical score was deleted.
