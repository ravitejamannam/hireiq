/**
 * Local validation helper. Confirms admin@hireiq.local accepts ADMIN_PASSWORD.
 * If it does not, sets that hash to ADMIN_PASSWORD and clears this email's login
 * rate-limit rows. Prints only match/updated, never the password.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";

function envValue(name) {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    if (line.startsWith(`${name}=`)) return line.slice(name.length + 1).trim().replace(/^"|"$/g, "");
  }
  return "";
}

const databaseUrl = envValue("DATABASE_URL");
const password = envValue("ADMIN_PASSWORD") || envValue("BOOTSTRAP_PASSWORD");
const email = "admin@hireiq.local";

function psql(query) {
  return execFileSync("psql", [databaseUrl, "-At", "-c", query], { encoding: "utf8" }).trim();
}

const hash = psql(`SELECT "passwordHash" FROM "User" WHERE email = '${email}'`);
const matches = hash ? await bcrypt.compare(password, hash) : false;
console.log(`admin password matches env: ${matches}`);
if (!matches) {
  const next = await bcrypt.hash(password, 12);
  execFileSync("psql", [
    databaseUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `UPDATE "User" SET "passwordHash" = $hash$${next}$hash$, "passwordChangedAt" = NOW() WHERE email = '${email}'`,
  ]);
  console.log("updated local admin password hash to ADMIN_PASSWORD");
}
psql(`DELETE FROM "AuthRateLimit" WHERE key LIKE '%${email}%' OR key LIKE 'ip:%'`);
console.log("cleared login rate-limit rows");
