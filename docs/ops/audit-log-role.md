# Audit log application role

`prisma migrate deploy` installs two triggers on `"AuditLog"`:

- `audit_log_immutable` rejects `UPDATE` and `DELETE`
- `audit_log_no_truncate` rejects `TRUNCATE`

A table owner can still `DROP TRIGGER` and then rewrite the log. The application connection must not be the table owner and must not be a superuser.

Create the role once on production and staging, then point `DATABASE_URL` at it. Do not run this as part of migrate: managed Postgres often denies `CREATE ROLE` to the migration user. Run it as an admin, then grant the migration user separately if migrations use a different login.

```sql
CREATE ROLE hireiq_app LOGIN PASSWORD 'replace-me' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

GRANT CONNECT ON DATABASE hireiq TO hireiq_app;
GRANT USAGE ON SCHEMA public TO hireiq_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hireiq_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hireiq_app;

REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLE "AuditLog" FROM hireiq_app;
GRANT SELECT, INSERT ON TABLE "AuditLog" TO hireiq_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hireiq_app;
```

`hireiq_app` can append audit rows. It cannot update, delete, truncate, or drop the triggers. Confirm after a deploy:

```sql
SELECT tgname FROM pg_trigger
WHERE tgrelid = '"AuditLog"'::regclass
  AND NOT tgisinternal
  AND tgname IN ('audit_log_immutable', 'audit_log_no_truncate');
```

Startup and CI call the same check and refuse to run when either trigger is missing.
