This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Authentication

HireIQ uses Auth.js (`next-auth` v5) with email/password credentials and JWT sessions.

Copy `.env.example` to `.env` and set:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Required secret for signing session tokens (`openssl rand -base64 32`) |
| `AUTH_URL` | Optional Auth.js public URL |
| `APP_URL` | Public app URL used in interviewer email links (preferred over `AUTH_URL`) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Optional Resend delivery for requirement-ready interviewer emails. Leave unset locally to skip real sends. |
| `ADMIN_EMAIL` / `ADMIN_NAME` / `ADMIN_PASSWORD` | Used only by the admin bootstrap script |

Bootstrap the first Admin user (idempotent; does not run on app startup):

```bash
pnpm db:bootstrap-admin
```

Then sign in at `/login`.

- Admin users land on `/dashboard`
- Client users land on `/client`

Dashboard and client routes require an authenticated session. Resource access is authorized server-side by portal role and tenant boundaries.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
