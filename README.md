# HireIQ

Evidence-first hiring OS for companies that run recruiting as an operation, not a spreadsheet plus a job board.

HireIQ is not a résumé wrapper. Every applicant fact traces to a source. Rankings are explained. Interviewers, clients, and admin share the same pipeline with role-specific authority.

## Who uses it

| Portal | Path | Job |
| --- | --- | --- |
| Admin | `/dashboard` | Run the hiring desk: requirements, sourcing, pipeline, interviewers, billing |
| Client | `/client` | Post roles, read candidate profiles, shortlist and hire |
| Interviewer | `/interviewer` | Publish a profile, evaluate assigned candidates, score interviews |
| Candidate | `/apply/[token]`, `/schedule/[token]`, `/assess/[token]` | Apply, book, take assessments — no account required |

## Local development

```bash
pnpm install
cp .env.example .env
pnpm exec prisma migrate deploy
pnpm db:bootstrap-admin
pnpm db:bootstrap-dev
pnpm dev
```

App: [http://localhost:4000](http://localhost:4000)

Required env: `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Optional: `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `GITHUB_TOKEN` (public GitHub proof on profiles).

Demo logins (password from `ADMIN_PASSWORD` / `BOOTSTRAP_PASSWORD`):

- `admin@hireiq.local`
- `owner.nimbus@hireiq.local` (client)
- `interviewer.arjun@hireiq.local`

The demo world is Nimbus Labs with live apply links, a scored pipeline, published interviewer profiles, and billing on a hired analyst role.

## What is in the product

- Hosted apply (resume, photo, structured profile) with tenant-safe public tokens
- Pipeline: CV pool → expert review → technical evaluation → shortlist → selected → hired
- Assessments, interview blueprints, rubric scoring, scheduling
- Candidate and interviewer profile pages (about, experience, education, public GitHub/LeetCode)
- Matching, ranking, evidence, identity — kept separate from presentation
- Client billing on hire, GDPR export/erase, org memberships

## Tests

```bash
pnpm test
pnpm exec tsc --noEmit
```

Do not invent GitHub/LeetCode stats. LinkedIn is a stored URL only — there is no public scrape.
