import { readFileSync } from "node:fs";

function parseEnv(path: string) {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const index = line.indexOf("=");
      out[line.slice(0, index)] = line.slice(index + 1).trim().replace(/^"|"$/g, "");
    }
  } catch {
    return out;
  }
  return out;
}

const envFile = parseEnv(".env");
const localFile = parseEnv(".env.local");

function dbName(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).pathname;
  } catch {
    return "unparsed";
  }
}

console.log(JSON.stringify({
  envDb: dbName(envFile.DATABASE_URL),
  localDb: dbName(localFile.DATABASE_URL),
  envPassword: Boolean(envFile.ADMIN_PASSWORD),
  localPassword: Boolean(localFile.ADMIN_PASSWORD),
  passwordsMatch: envFile.ADMIN_PASSWORD === localFile.ADMIN_PASSWORD,
  envEmail: envFile.ADMIN_EMAIL ?? null,
  localEmail: localFile.ADMIN_EMAIL ?? null,
}));
