import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function applyTestEnvFile(options: {
  env: Record<string, string | undefined>;
  readFile: (path: string) => string;
  envPath: string;
}) {
  if (options.env.DATABASE_URL) {
    return;
  }

  let text: string;
  try {
    text = options.readFile(options.envPath);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key === "DATABASE_URL" || key === "DIRECT_URL") {
      continue;
    }
    if (options.env[key] === undefined) {
      options.env[key] = value;
    }
  }
}

applyTestEnvFile({
  env: process.env,
  readFile: (path) => readFileSync(path, "utf8"),
  envPath: resolve(process.cwd(), ".env"),
});
