import { config } from "dotenv";

const envFile = config({ path: ".env" }).parsed ?? {};
const localFile = config({ path: ".env.local" }).parsed ?? {};

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
