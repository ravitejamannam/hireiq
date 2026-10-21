/**
 * Fail-closed identity check for the E2E seed scripts.
 *
 * A script may touch a database only when the operator names that database exactly in
 * E2E_DATABASE_NAME and DATABASE_URL (already present in the process environment) resolves
 * to the same local database. Nothing here reads .env files, connects to a database, or
 * puts the URL in an error message.
 */

/** Never usable by the E2E scripts, by exact name or as part of a longer name. */
export const PROTECTED_E2E_DATABASE_NAME = "hireiq_e2e_full";

/** A disposable database must carry this prefix so it cannot be mistaken for a kept one. */
export const DISPOSABLE_E2E_DATABASE_PREFIX = "hireiq_e2e_disp_";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
/** Connection options that do not change which server or database is used. */
const ALLOWED_QUERY_KEYS = new Set(["connection_limit", "pool_timeout", "connect_timeout", "schema", "sslmode"]);
const NAME_PATTERN = /^[a-z0-9_]{1,63}$/;

export class E2eDatabaseGuardError extends Error {
  constructor(reason: string) {
    super(`E2E database guard: ${reason}`);
    this.name = "E2eDatabaseGuardError";
  }
}

export function assertE2eDatabase(env: Record<string, string | undefined> = process.env): { database: string } {
  const expected = env.E2E_DATABASE_NAME;
  if (!expected) throw new E2eDatabaseGuardError("E2E_DATABASE_NAME is not set.");
  if (!NAME_PATTERN.test(expected)) throw new E2eDatabaseGuardError("E2E_DATABASE_NAME is not a plain lowercase database name.");
  if (expected.includes(PROTECTED_E2E_DATABASE_NAME)) {
    throw new E2eDatabaseGuardError("E2E_DATABASE_NAME names the protected database.");
  }
  if (!expected.startsWith(DISPOSABLE_E2E_DATABASE_PREFIX) || expected.length === DISPOSABLE_E2E_DATABASE_PREFIX.length) {
    throw new E2eDatabaseGuardError(`E2E_DATABASE_NAME must start with ${DISPOSABLE_E2E_DATABASE_PREFIX} and add a unique suffix.`);
  }

  const raw = env.DATABASE_URL;
  if (!raw) throw new E2eDatabaseGuardError("DATABASE_URL is not set in the process environment.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new E2eDatabaseGuardError("DATABASE_URL is not a valid URL.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new E2eDatabaseGuardError("DATABASE_URL is not a PostgreSQL URL.");
  }
  if (!LOCAL_HOSTS.has(url.hostname.toLowerCase())) {
    throw new E2eDatabaseGuardError("DATABASE_URL does not point at the local machine.");
  }
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_KEYS.has(key)) {
      throw new E2eDatabaseGuardError("DATABASE_URL has a connection option that could redirect the connection.");
    }
  }
  const segments = url.pathname.split("/").slice(1);
  if (segments.length !== 1 || !segments[0]) {
    throw new E2eDatabaseGuardError("DATABASE_URL must name exactly one database.");
  }
  let database: string;
  try {
    database = decodeURIComponent(segments[0]);
  } catch {
    throw new E2eDatabaseGuardError("DATABASE_URL has a malformed database name.");
  }
  if (database.includes(PROTECTED_E2E_DATABASE_NAME)) {
    throw new E2eDatabaseGuardError("DATABASE_URL points at the protected database.");
  }
  if (database !== expected) {
    throw new E2eDatabaseGuardError("DATABASE_URL database does not match E2E_DATABASE_NAME.");
  }
  return { database };
}
