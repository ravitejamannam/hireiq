# Remaining roadmap

These features stay inside the company that owns the data. Vendor calls stay off until that company's credentials are set. HireIQ does not build autonomous AI interviewers, face or voice or emotion analysis, automatic rejection from an AI score, personality inference, or a scraped profile database.

## SSO and SCIM

OIDC for Okta, Azure AD, and Google Workspace. SAML responses are verified by `@node-saml/node-saml` with `wantAssertionsSigned`. HireIQ does not parse the signature itself. SCIM 2.0 supports Users and Groups, `userName eq` filters, pagination, and PATCH. Deactivating a user sets `disabledAt` and `passwordChangedAt` immediately, which revokes sessions on the next JWT check, and revokes that company's API keys. That is well under 60 seconds. Group names map to CLIENT, INTERVIEWER, or a company ADMIN. A map never creates a platform operator.

`lib/identity/scim.test.ts` covers the requests those validators send: discovery documents, create, duplicate, userName and email and externalId filters, pagination, Okta and Azure deactivation, name patch, PUT, DELETE, group add, duplicate member, remove, and replace. The hosted Okta and Azure validator sites were not run from this machine because they need an Okta org and an Azure tenant.

## Item statistics

Difficulty is the p-value. Discrimination is the corrected point-biserial. Reliability is Cronbach's alpha. Items are flagged when they are too easy, too hard, or weakly related to the rest of the test. DIF is not computed until each group has 30 responses. The statistics module does not read self-identification; group labels come from the fairness sample.

## Interview notetaker

Metaview and BrightHire notes are stored only after every participant has consented. Quotes and timestamps are kept. Any rating in the payload is dropped. Without an integration, manual notes can be cleaned up through an `interview_notes` AIRun. The interviewer still owns the rating.

## Assessment AI policy

Each invite is `NOT_ALLOWED` or `AI_ALLOWED`. The assistant refuses when it is not allowed and does not call a model. When it is allowed, the prompt and reply are stored and an `assessment_assistant` AIRun is written.

## HRIS handoff

A hire can be mapped for Keka, Darwinbox, Zoho People, and BambooHR and signed with the same timestamped webhook signature. CSV is the fallback when a provider secret is not set. Handoff does not run before status HIRED.

## Outreach

AI drafts an email and records an `outreach_draft` AIRun. Nothing is sent until the recruiter approves that step. Unsubscribe and a detected reply both stop the sequence.

## Browser extension

`extension/` saves the single public profile in the tab the user clicked. A request that includes a list of profiles is rejected.

## E-signature

Leegality (including Aadhaar eSign) and DocuSign stay in DRAFT until credentials exist. Aadhaar is refused on DocuSign.

## Report filters

`/dashboard/analytics` accepts a question and turns it into a metric, source, and stage. Protected-attribute questions get the same refusal as the copilot. The parser does not call a model.

## Localisation

English and Hindi strings ship for the analytics and training screens. Tamil, Telugu, Marathi, and Kannada are registered locales and fall back to English until translations are added.

## MCP

`GET/POST /api/mcp` exposes read-only `search_candidates`, `pipeline_stats`, and `job_details`, authenticated with the company API key. Another company's job is not found. Protected-attribute questions are refused. Write tools are not registered.

## Interviewer training

Two shadow sessions and two reverse-shadow sessions set `qualifiedAt`. When a company turns on `requireQualifiedLead`, assigning a lead interviewer without that flag is rejected.
