# HireIQ — Product & Engineering Constitution

Version: 1.0
Status: Living Product Specification

---

# 1. What HireIQ Is

HireIQ is a multi-tenant hiring and recruitment operating platform.

Its purpose is to help companies manage the complete candidate lifecycle:

Job creation
→ job publishing
→ candidate acquisition
→ application ingestion
→ candidate evidence collection
→ candidate intelligence
→ requirement matching
→ evidence coverage
→ assessment
→ recruiter evaluation
→ technical evaluation
→ interview
→ shortlist
→ client selection
→ hire
→ billing
→ hiring analytics
→ eventual outcome feedback.

HireIQ is NOT merely:

- a job board
- a resume parser
- an ATS CRUD application
- an AI chatbot
- an AI candidate-ranking engine
- an assessment platform

It is an integrated hiring operating system.

The platform combines:

1. Candidate acquisition
2. Application management
3. Evidence management
4. Candidate intelligence
5. Requirement matching
6. Assessment
7. Human evaluation
8. Hiring workflow
9. Client collaboration
10. Billing
11. Analytics
12. Auditability

The core philosophy is:

IDENTITY ≠ PROFILE ≠ EVIDENCE ≠ INTELLIGENCE ≠ MATCHING ≠ RANKING ≠ ASSESSMENT ≠ HUMAN DECISION.

These are separate domains.

Never collapse them merely because doing so is easier to implement.

---

# 2. Product Goal

HireIQ should allow a recruiter/company to move from:

"We have an open role and hundreds of applicants"

to:

"We have a reliable, traceable, explainable view of every application and can make a human hiring decision using evidence."

The system should reduce:

- manual candidate screening
- fragmented candidate data
- duplicated candidate records
- poor source attribution
- inconsistent screening
- recruiter workload
- client communication overhead
- hiring process latency
- lack of auditability

while preserving:

- human control
- tenant isolation
- candidate privacy
- evidence traceability
- deterministic behavior where possible
- explainability
- historical reproducibility.

---

# 3. Product Principles

## Principle 1 — Evidence before intelligence

The system must not invent candidate facts.

Candidate data should follow:

Source
→ Evidence
→ Intelligence
→ Match
→ Ranking/Decision Support

Never:

Profile
→ fabricated evidence
→ AI claim
→ ranking.

## Principle 2 — Human decision remains separate

HireIQ may provide:

- evidence
- assessments
- matching
- ranking
- explanations
- analytics
- recommendations as decision support

but must not silently convert machine output into:

- rejection
- shortlist
- selection
- hiring
- employment decision

unless a future explicitly approved product policy authorizes it.

## Principle 3 — Every machine decision must be traceable

Whenever the platform says a requirement is satisfied, it should be possible to trace:

Application
→ MatchRun
→ RequirementMatch
→ CandidateClaim
→ Evidence
→ original source.

No opaque AI-only hiring decision.

## Principle 4 — Unknown is not false

If the platform does not have evidence that a candidate has a skill, that does not prove the candidate lacks it.

Use:

UNKNOWN

rather than:

NOT_SATISFIED

unless actual negative evidence exists.

## Principle 5 — Tenant isolation is absolute

Every company must operate in an isolated tenant boundary.

Never trust:

- browser companyId
- query-string companyId
- client-provided tenant identifiers
- arbitrary candidate IDs
- arbitrary application IDs

for authorization.

Tenant ownership must be derived from authorized database relationships.

## Principle 6 — Historical data is immutable where it represents an audit snapshot

Do not rewrite historical:

- evidence
- intelligence runs
- match runs
- ranking runs
- assessments
- hiring decisions

unless the owning domain explicitly defines mutable semantics.

New information should normally create a new version/run/snapshot.

## Principle 7 — Deterministic before AI

If a requirement can be solved reliably using deterministic logic, prefer deterministic logic.

Do not introduce:

- LLMs
- embeddings
- ML
- agents

just because they are available.

AI is appropriate where semantic extraction or reasoning genuinely requires it.

## Principle 8 — No hidden scores

Do not invent:

- fitScore
- candidateScore
- hireScore
- qualityScore
- confidenceScore
- rankingScore

unless explicitly defined by a future product ticket.

Every scoring/ranking policy must have:

- documented semantics
- version
- inputs
- output definition
- audit trail.

---

# 4. Users / Roles

HireIQ has multiple actor classes.

## ADMIN

The primary internal recruitment/operator role.

Admin can generally:

- manage companies
- manage jobs
- manage candidates
- manage applications
- manage evidence
- run intelligence
- run matching
- run evidence coverage ranking
- review candidates
- conduct evaluation workflow
- move candidates through allowed pipeline states
- manage assessments
- manage clients
- manage interviewers
- manage hiring workflows
- manage billing-related operations
- access administrative audit information.

Admin is the primary operator of machine intelligence.

## CLIENT

The hiring/customer organization.

Client can:

- view jobs assigned to them
- review candidates exposed to them
- participate in shortlist decisions
- select candidates
- confirm hiring
- view permitted candidate/assessment information.

Client must NOT automatically gain access to:

- internal recruiter notes
- private evidence
- raw AI prompts
- model completions
- internal audit metadata
- administrative configuration
- other tenants.

Client-visible ranking is a product/legal decision and must not be assumed.

## INTERVIEWER

Technical/interview participant.

Interviewer can:

- access assigned candidates
- perform permitted evaluations
- participate in technical evaluation
- conduct interviews
- record interview results
- view information required for the interview.

Interviewer must not manage:

- tenant configuration
- machine intelligence
- matching
- ranking
- billing
- client selection.

## PUBLIC CANDIDATE

Unauthenticated candidate interacting with public hiring flows.

Candidate can:

- view public job/application pages
- submit hosted applications
- receive assessment access
- take permitted assessments
- view permitted public assessment leaderboard information.

Public candidate must never receive:

- other candidates' PII
- internal notes
- private evidence
- company internals
- recruiter information not explicitly intended for public display.

---

# 5. Core Product Lifecycle

The canonical hiring lifecycle is:

ADMIN
→ CREATE COMPANY
→ CREATE JOB
→ CREATE JOB SPECIFICATION
→ PUBLISH JOB
→ DISTRIBUTE JOB
→ CANDIDATE DISCOVERS JOB
→ HOSTED APPLY / PROVIDER INGESTION
→ CANDIDATE CREATED/RESOLVED
→ APPLICATION CREATED
→ ASSESSMENT INVITE
→ ASSESSMENT
→ ASSESSMENT SCORE
→ LEADERBOARD

Then the intelligence rail:

APPLICATION
→ CANDIDATE EVIDENCE
→ CANDIDATE INTELLIGENCE
→ CANDIDATE CLAIMS
→ CANDIDATE MATCHING
→ EVIDENCE COVERAGE

Then the human rail:

APPLICATION
→ EXPERT REVIEW
→ TECHNICAL EVALUATION
→ INTERVIEW
→ SHORTLIST
→ CLIENT SELECT
→ HIRE
→ BILLING

These rails must remain conceptually separate.

---

# 6. Application Is the Hiring Unit

For job-specific workflow, Application is the primary hiring-pipeline entity.

A candidate can have:

Application A → Job A

Application B → Job B

These are separate hiring contexts.

Never treat a Candidate as globally ranked for all jobs.

Matching and ranking are job/application scoped.

---

# 7. Candidate Domain

Candidate represents a hiring identity/record.

Candidate data can include historical or operational fields.

However:

Candidate fields are NOT automatically evidence.

Do not treat legacy fields such as:

- skills
- experienceYears
- location
- currentEmployer
- role

as verified evidence unless a future explicitly approved architecture says so.

---

# 8. Candidate Profile

CandidateProfile is a mutable descriptive layer.

It can contain:

- headline
- summary
- profile description
- recruiter-maintained information

Profile is not immutable evidence.

Profile changes must not silently change historical:

- evidence
- claims
- matching results
- ranking snapshots.

Never automatically overwrite CandidateProfile using AI extraction.

---

# 9. Identity Domain

Identity handles relationships between candidate handles/person groupings.

Identity may contain:

- company membership
- email signals
- phone signals
- LinkedIn/provider IDs
- identity decisions.

Identity is NOT candidate capability.

Do not use:

- email
- phone
- LinkedIn
- provider IDs

as hiring skill evidence.

Do not merge candidates simply because identity signals appear related.

---

# 10. Application Sources

Application sourcing can include provider channels and hosted application.

Source attribution must remain separate from candidate evidence.

Never convert:

Application.source

into:

CandidateEvidence.

Source tells us WHERE the candidate came from.

Evidence tells us WHAT information the candidate supplied.

---

# 11. Hosted Apply

Hosted Apply is a public application experience.

Typical flow:

Public Job
→ Candidate fills application
→ Server validates
→ Candidate created/resolved
→ Application created
→ assessment invite
→ redirect to assessment.

Repeated submission of the same application should follow the product's idempotency rules.

Hosted apply must remain tenant-safe.

---

# 12. Assessment System

HireIQ includes an assessment system.

Current assessment concept:

- role-category question banks
- 10 questions per supported category
- auto-scoring
- one-shot submission
- 48-hour assessment window
- assessment invite token
- assessment result
- leaderboard.

Current categories include:

- Engineering
- Sales
- Design
- Finance

Assessment score is an independent signal.

It is NOT:

- T94 evidence coverage
- expertScore
- fitScore
- hire probability.

Assessment must not automatically change hiring status.

---

# 13. Assessment Security

Assessment tokens must be:

- unguessable
- candidate/application scoped
- time-limited
- single-use where appropriate
- server validated.

Server must enforce:

- expiration
- one-shot submission
- candidate/application ownership
- tenant ownership
- no answer tampering
- no score manipulation.

Disabling UI buttons is not sufficient security.

---

# 14. Assessment Leaderboard

Public leaderboard may expose only deliberately permitted information.

Current intended public fields:

- candidate name
- assessment score

Do not expose:

- email
- phone
- LinkedIn
- internal IDs
- recruiter notes
- evidence
- intelligence claims
- private evaluation
- private assessment metadata.

Leaderboard must be scoped to the correct role/job/company.

Assessment leaderboard ranking is not T94 evidence ranking.

---

# 15. Evidence Domain

CandidateEvidence is the canonical evidence artifact.

Evidence is:

- append-only
- hashed
- traceable
- tenant scoped
- revocable
- supersedable.

Evidence sources currently include:

- HOSTED_APPLY_SUBMISSION
- RECRUITER_ENTERED_TEXT
- INGESTION_EVENT reserved where applicable.

Do not fabricate evidence.

Do not create evidence from:

Candidate.skills
CandidateProfile
Candidate.role
Candidate.location
Candidate.experienceYears

unless a future ticket explicitly establishes that source as legitimate evidence.

---

# 16. Evidence Lifecycle

Evidence:

CREATE
→ ACTIVE
→ optionally REVOKED
or
→ SUPERSEDED

Historical evidence remains auditable.

New intelligence/matching snapshots must exclude revoked/superseded evidence where specified by the owning contract.

Never silently rewrite historical evidence.

---

# 17. Candidate Intelligence

Candidate intelligence derives structured claims from evidence.

Current T92 concept:

Evidence
→ AI extraction
→ CandidateIntelligenceRun
→ CandidateClaim.

Current claim types include:

- SKILL
- EMPLOYER
- JOB_TITLE
- LOCATION.

Claims are derived intelligence, not unquestionable truth.

Every claim must retain:

- candidate
- company
- evidence
- run
- extractor version
- model/prompt metadata where applicable.

---

# 18. AI Rules

AI must be:

- server-side
- explicitly invoked
- versioned
- fail-closed
- timeout bounded
- validated
- grounded where required.

Never send candidate information to an external AI provider unless explicitly authorized.

Never log:

- prompt
- completion
- cover letter
- email
- phone
- raw PII

unless explicitly required by an approved debugging/security process.

AI must never silently mutate candidate profiles.

---

# 19. Matching

Matching determines whether available candidate evidence supports job requirements.

Current matching unit:

Application
↔
JobSpecificationVersion.

Current V1 deterministic matching supports:

- primary skills
- exact location.

Current result vocabulary:

SATISFIED
UNKNOWN
UNSUPPORTED.

UNKNOWN means:

"No supporting evidence was found."

It does NOT mean:

"The candidate does not possess this skill."

---

# 20. Matching Rules

Do not use:

- profile data as verified evidence
- identity data
- expertScore
- interview results
- candidate pipeline status
- human recommendations

as requirement evidence.

Matching must not produce ranking.

Matching must not modify Application.status.

---

# 21. Ranking

Ranking is a separate layer from matching.

Current T94 concept:

Job
+
Published JobSpecificationVersion
+
Applications
+
completed T93 MatchRuns

→ evidence coverage order.

Current V1 ranking:

count exact SATISFIED SKILL matches.

Tie-break:

application.id ascending.

Do not call this:

- Best Candidate
- Top Applicant
- Best Hire
- Hire Recommendation

unless future product policy explicitly defines those semantics.

Current honest terminology:

Evidence Coverage
Top Evidence Match
Evidence Coverage Order.

---

# 22. Human Hiring Rail

Human decisions remain independent.

Relevant human signals include:

- expertScore
- Evaluation
- Interview
- CodingTest
- Report
- pipeline transitions
- Client SELECT
- Client HIRE.

Machine ranking must not overwrite these.

Machine signals and human decisions should be shown together only through an explicit decision-support design.

---

# 23. Pipeline

Application lifecycle has defined statuses.

Typical lifecycle:

CV_POOL
→ EXPERT_REVIEW
→ TECH_EVALUATION
→ SHORTLISTED
→ SELECTED
→ HIRED

with REJECTED as a terminal path where permitted.

Pipeline transitions must be:

- role authorized
- state validated
- server enforced
- auditable.

Do not bypass pipeline rules.

Do not let AI silently mutate status.

---

# 24. Client Selection

Client selection is a human/client action.

Machine signals may inform the decision.

They must not automatically select a candidate.

Selection should remain auditable.

---

# 25. Hiring

Hire confirmation is a separate workflow.

Hiring can trigger downstream billing/workflow operations according to the existing product contract.

Never mark an application HIRED simply because:

- assessment score is high
- T94 rank is #1
- matching coverage is high
- AI claims are strong.

---

# 26. Billing

Billing is part of the hiring lifecycle.

Hiring-related billing transitions must be:

- idempotent
- tenant scoped
- auditable
- protected from duplicate generation.

Do not modify billing behavior while implementing unrelated candidate intelligence features.

---

# 27. Job Domain

A Job represents an opening.

A Job has a JobSpecificationVersion.

Job specifications must remain versioned.

Published specifications are immutable.

DRAFT specifications may be edited.

Matching/ranking must use explicit published versions.

Never silently match against a mutable DRAFT.

---

# 28. Future Structured Requirements

The current job specification contains free-text fields.

Future architecture may introduce structured requirements such as:

SKILL
EXPERIENCE
EDUCATION
CERTIFICATION
LOCATION
WORK_AUTHORIZATION
EMPLOYMENT_TYPE
AVAILABILITY

but this must be additive and versioned.

Do not break existing T81 behavior.

Do not invent structure without a ticket.

---

# 29. Resume Roadmap

Resume support is a future domain.

Expected future architecture:

Resume file
→ secure object storage
→ document metadata
→ parsing
→ CandidateEvidence
→ CandidateClaim
→ Matching.

Do not store large resume binaries directly in PostgreSQL.

Do not add resume support to an unrelated ticket.

Potential formats:

PDF
DOCX
TXT

OCR may be a later capability.

---

# 30. Future Candidate Intelligence

Future intelligence may extract:

- skills
- employers
- titles
- locations
- education
- certifications
- experience
- projects
- technologies.

Every extracted fact must remain traceable to evidence.

AI extraction must not directly modify CandidateProfile.

---

# 31. Future Matching V2

Future matching may support:

- structured requirements
- skill aliases
- semantic matching
- experience
- education
- certifications
- work authorization
- availability
- location ontology.

But every new matching capability must define:

- input source
- evidence requirements
- result vocabulary
- version
- explainability
- tenant behavior
- privacy implications.

---

# 32. Future Ranking

Ranking may eventually combine multiple machine-readable dimensions.

Potential dimensions:

- must-have coverage
- skill coverage
- experience compatibility
- education
- certification
- assessment
- evidence quality.

Any ranking policy must be:

- explicit
- versioned
- reproducible
- auditable
- explainable.

No hidden weights.

---

# 33. Human + Machine Decision Support

Future decision-support UI may present:

Assessment
+
Evidence
+
Matching
+
Ranking
+
Human Evaluation
+
Interview
+
Coding
+
Report.

But the system should present these as separate signals.

Do not hide them behind one opaque score.

---

# 34. Client Experience

The Client experience should eventually provide a clean hiring workspace.

Client may eventually see:

- candidate list
- relevant evidence
- assessment
- matching
- recruiter-approved information
- interview/evaluation
- shortlist
- selection
- hiring.

Client should not automatically receive internal administrative information.

Visibility must be governed by explicit authorization policy.

---

# 35. Notifications

Future workflow automation may trigger:

- candidate assessment invitations
- recruiter notifications
- client notifications
- interview reminders
- shortlist-ready notifications
- hiring notifications.

Notifications must not perform hiring decisions themselves.

---

# 36. Analytics

Future analytics should measure:

- applications
- source performance
- assessment completion
- screening time
- shortlist conversion
- interview conversion
- selection conversion
- hire conversion
- time-to-hire
- source-to-hire
- recruiter workload
- candidate funnel.

Analytics must not mutate source data.

---

# 37. Outcome Feedback

Future outcome systems may connect:

ranking/matching snapshot
→ interview
→ selection
→ hire
→ outcome.

This can eventually support evaluation of ranking quality.

Do not introduce ML ranking merely because outcome data exists.

First establish:

- clean labels
- snapshot lineage
- data quality
- fairness analysis
- sufficient sample size.

---

# 38. Security

Security is a first-class product requirement.

Every server action must validate:

1. authentication
2. role
3. tenant ownership
4. object ownership
5. action authorization
6. state validity.

Never rely on UI hiding.

---

# 39. Tenant Isolation

For every multi-tenant entity:

companyId must be present where appropriate.

Where an entity intentionally lacks companyId, such as JobSpecificationVersion, tenant isolation must be enforced through its owning relationship.

Never use:

findFirst({ id })

when tenant-scoped lookup is required.

Prefer composite ownership constraints.

---

# 40. Privacy

HireIQ processes potentially sensitive hiring information.

Never unnecessarily expose:

- email
- phone
- LinkedIn
- resume
- recruiter notes
- evidence text
- AI prompts
- AI completions.

Public APIs must return the minimum necessary data.

---

# 41. Auditability

Important actions should be reproducible.

Examples:

Why was this requirement satisfied?

Application
→ MatchRun
→ RequirementMatch
→ Claim
→ Evidence.

Why did this application rank first?

Application
→ RankingRun
→ RankingResult
→ MatchRun
→ RequirementMatches.

Why was candidate hired?

Pipeline
→ human decisions
→ selection
→ hire.

---

# 42. Idempotency

Important operations should be safe to retry.

Examples:

- application creation
- assessment invite creation
- evidence capture
- intelligence runs
- matching runs
- ranking runs
- billing operations
- notifications.

Repeated execution should not create duplicate business objects unless the architecture explicitly defines a new historical run.

---

# 43. Versioning

Machine systems must be versioned.

Relevant versions may include:

- extractorVersion
- modelName
- promptVersion
- matcherVersion
- requirementParseVersion
- aliasMapVersion
- rankingPolicyVersion
- assessmentBankVersion.

Never silently change historical semantics.

---

# 44. AI Architecture

Current AI should remain limited to approved domains.

AI may be used for:

- job description intelligence
- evidence/claim extraction
- future resume intelligence
- future semantic matching only after explicit architecture approval.

AI should NOT automatically:

- hire
- reject
- shortlist
- select
- modify profiles
- modify identity
- modify evidence
- alter human evaluations.

---

# 45. Data Ownership Rules

## Candidate owns identity record.

## CandidateProfile owns mutable descriptive profile.

## Application owns job-specific hiring relationship.

## CandidateEvidence owns source artifacts.

## CandidateIntelligenceRun owns extraction execution.

## CandidateClaim owns derived claims.

## CandidateMatchRun owns requirement matching snapshot.

## RequirementMatch owns requirement-level result.

## JobRankingRun owns cohort ranking snapshot.

## JobRankingResult owns application-level ranking result.

## Assessment owns assessment execution/result.

## Evaluation/Interview/CodingTest/Report own human assessment domains.

## Pipeline owns hiring state.

## Billing owns billing state.

Never duplicate ownership unnecessarily.

---

# 46. Frozen Domains

Unless an explicitly approved ticket requires an additive compatibility change, do not casually modify:

- auth.ts
- auth.config.ts
- proxy.ts
- JWT contract
- billing
- T69/T70 sourcing/shortlist behavior
- T81–T88 provider/hosted-apply behavior
- T89 profile semantics
- T90 identity semantics
- T91 evidence semantics
- T92 intelligence semantics
- T93 matching semantics
- T94 ranking semantics
- Application.source
- Application.status
- Application.expertScore
- Evaluation
- Interview
- CodingTest
- Report.

---

# 47. Current Product State

Do not assume every historical ticket is verifiable.

Known state:

T1–T61:
Historical identifiers not reliably reconstructable.

T62–T88:
Partially/reliably recoverable depending on ticket.

T89:
Candidate Profile.

T90:
Candidate Identity.

T91:
Candidate Evidence.

T92:
Candidate Intelligence.

T93:
Candidate Matching.

T94:
Evidence Coverage Ranking.

T95:
Application Textual Evidence Capture.

Assessment + leaderboard:
Implemented as a separate post-application workflow and must be treated as an existing product capability.

T96+:
Future roadmap unless explicitly implemented.

Historical W01–W30:
Unavailable/not claimed.

Never fabricate requirements for unavailable tickets.

---

# 48. Current Machine Intelligence Chain

Current chain:

Application
↓
CandidateEvidence
↓
CandidateIntelligenceRun
↓
CandidateClaim
↓
CandidateMatchRun
↓
RequirementMatch
↓
JobRankingRun
↓
JobRankingResult.

This chain is intentionally layered.

Do not collapse it.

---

# 49. Current Assessment Chain

Current chain:

Application
↓
AssessmentInvite
↓
Assessment
↓
Auto Score
↓
Leaderboard

Assessment is independent of T92/T93/T94.

Do not silently merge the assessment score into evidence coverage.

---

# 50. Complete Future Product

The eventual HireIQ product should look conceptually like:

                    COMPANY
                       │
                       ▼
                     JOB
                       │
                 JOB SPECIFICATION
                       │
              ┌────────┴─────────┐
              ▼                  ▼
          DISTRIBUTION       HOSTED APPLY
              │                  │
              └────────┬─────────┘
                       ▼
                  APPLICATION
                       │
       ┌───────────────┼────────────────┐
       │               │                │
       ▼               ▼                ▼
   ASSESSMENT       EVIDENCE        HUMAN REVIEW
       │               │                │
       ▼               ▼                ▼
     SCORE         INTELLIGENCE      EVALUATION
       │               │                │
       ▼               ▼                ▼
 LEADERBOARD         CLAIMS          INTERVIEW
                       │                │
                       ▼                ▼
                    MATCHING         CODING
                       │                │
                       ▼                ▼
                    RANKING           REPORT
                       │                │
                       └────────┬───────┘
                                ▼
                         DECISION SUPPORT
                                │
                                ▼
                            SHORTLIST
                                │
                                ▼
                              CLIENT
                                │
                                ▼
                             SELECT
                                │
                                ▼
                              HIRE
                                │
                                ▼
                             BILLING
                                │
                                ▼
                            ANALYTICS
                                │
                                ▼
                         OUTCOME FEEDBACK

---

# 51. What HireIQ Must Become

HireIQ should ultimately answer these questions:

1. Where did this candidate come from?
2. What job did they apply to?
3. What information did they actually provide?
4. What evidence do we have?
5. What claims were extracted from that evidence?
6. Which requirements does the evidence support?
7. What is unknown?
8. How did the candidate perform on assessment?
9. What did recruiters think?
10. What happened during interview?
11. What happened during technical evaluation?
12. Why was the candidate shortlisted?
13. Why did the client select them?
14. Why were they hired?
15. What happened after hiring?
16. How accurate/useful were our matching and ranking systems?

Every answer should be traceable to data.

---

# 52. Engineering Decision Rule

When implementing a new feature, ask:

1. Which domain owns this?
2. What is its source of truth?
3. Is this evidence, intelligence, matching, ranking, assessment, or human decision?
4. Does this change an existing contract?
5. Can it be additive?
6. Does it need versioning?
7. Does it need idempotency?
8. Does it need tenant isolation?
9. Does it expose PII?
10. Does it invoke AI?
11. Does it affect hiring decisions?
12. Can it be audited later?
13. Can the behavior be tested without external services?
14. What happens when the operation is retried?
15. What happens if the underlying evidence is revoked?
16. What happens if the job specification changes?
17. What happens if the candidate applies to another job?

If these questions cannot be answered, stop and design before coding.

---

# 53. Agent Rules

Coding agents working on HireIQ must:

- inspect before modifying
- understand ownership before changing schema
- preserve tenant isolation
- preserve authorization
- preserve historical immutability
- prefer additive migrations
- avoid destructive migrations
- avoid unrelated refactors
- avoid speculative abstractions
- avoid hidden scoring
- avoid unapproved AI
- avoid profile laundering
- avoid identity-based matching
- avoid automatic hiring decisions
- write verification tests
- run relevant tests
- report failures honestly
- never claim tests were run if they were not
- never fabricate historical requirements.

---

# 54. Definition of Done

A feature is not complete merely because:

- TypeScript compiles
- build passes
- UI renders
- unit tests pass.

A feature is complete when:

1. architecture is documented
2. implementation exists
3. authorization is tested
4. tenant isolation is tested
5. happy path is tested
6. failure paths are tested
7. idempotency is tested where relevant
8. historical behavior is protected
9. relevant integration workflows are tested
10. TypeScript passes
11. lint passes
12. build passes
13. diff check passes
14. no unrelated files were changed
15. known limitations are documented.

---

# 55. Final Rule

When uncertain:

DO NOT GUESS.

Inspect the repository.
Read the relevant architecture document.
Identify the owning domain.
Ask for clarification if the product decision is genuinely unresolved.

Preserve the architecture before adding functionality.

HireIQ is not a collection of isolated features.

It is a layered hiring system.
