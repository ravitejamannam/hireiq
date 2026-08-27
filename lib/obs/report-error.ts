/**
 * Structured error reporting. Console always; Sentry envelope when DSN is set.
 * No SDK — keeps production deploys small.
 */

function sentryIngestUrl(dsn: string): string | null {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) {
      return null;
    }
    return `${url.protocol}//${url.host}/api/${projectId}/store/?sentry_key=${publicKey}&sentry_version=7`;
  } catch {
    return null;
  }
}

export function reportError(
  scope: string,
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(`[${scope}]`, message, extra ?? {});

  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }
  const ingest = sentryIngestUrl(dsn);
  if (!ingest) {
    return;
  }

  const payload = {
    message,
    logger: scope,
    extra: { ...extra, stack },
    timestamp: Date.now() / 1000,
    platform: "node",
  };

  void fetch(ingest, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(4_000),
  }).catch(() => undefined);
}
