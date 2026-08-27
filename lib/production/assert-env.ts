/**
 * Production environment contract.
 *
 * Local development may omit email, object storage, and cron secrets.
 * Production (`NODE_ENV=production`) fails closed on missing required vars
 * so a misconfigured deploy cannot mint tokens or drop candidate emails.
 */

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

function missing(name: string, value: string | undefined) {
  return !value?.trim() ? name : null;
}

export function getProductionEnvProblems(): string[] {
  if (!isProductionRuntime()) {
    return [];
  }

  const problems = [
    missing("DATABASE_URL", process.env.DATABASE_URL),
    missing("AUTH_SECRET", process.env.AUTH_SECRET),
    missing("APP_URL", process.env.APP_URL),
    missing("RESEND_API_KEY", process.env.RESEND_API_KEY),
    missing("EMAIL_FROM", process.env.EMAIL_FROM),
  ].filter((name): name is string => Boolean(name));

  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    try {
      const url = new URL(appUrl);
      if (
        url.protocol !== "https:" &&
        process.env.ALLOW_INSECURE_APP_URL !== "1"
      ) {
        problems.push("APP_URL must be https in production (or set ALLOW_INSECURE_APP_URL=1)");
      }
    } catch {
      problems.push("APP_URL is not a valid URL");
    }
  }

  const driver = (process.env.RESUME_STORAGE_DRIVER ?? "LOCAL").trim().toUpperCase();
  if (driver === "S3") {
    problems.push(
      ...[
        missing("S3_BUCKET", process.env.S3_BUCKET),
        missing("S3_REGION", process.env.S3_REGION),
        missing("S3_ACCESS_KEY_ID", process.env.S3_ACCESS_KEY_ID),
        missing("S3_SECRET_ACCESS_KEY", process.env.S3_SECRET_ACCESS_KEY),
      ].filter((name): name is string => Boolean(name)),
    );
  } else if (driver !== "LOCAL") {
    problems.push(`Unknown RESUME_STORAGE_DRIVER: ${driver}`);
  } else {
    console.warn(
      "[production] RESUME_STORAGE_DRIVER=LOCAL — resumes will not survive ephemeral disks. Use S3 in multi-instance deploys.",
    );
  }

  return problems;
}

/** Called from instrumentation.ts on Node boot. */
export function assertProductionEnv() {
  const problems = getProductionEnvProblems();
  if (problems.length === 0) {
    return;
  }

  throw new Error(
    `HireIQ production env is incomplete: ${problems.join(", ")}`,
  );
}
