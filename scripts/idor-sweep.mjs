/**
 * Log in as a company-scoped user and open every numeric [id] route with
 * an id that belongs to a different company. A leak is HTTP 200.
 *
 *   BASE=http://localhost:4000 node scripts/idor-sweep.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = process.env.BASE ?? "http://localhost:4000";

function databaseUrl() {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    if (line.startsWith("DATABASE_URL=")) return line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
  }
  throw new Error("DATABASE_URL missing");
}

function password() {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    if (line.startsWith("ADMIN_PASSWORD=") || line.startsWith("BOOTSTRAP_PASSWORD=")) {
      const value = line.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "");
      if (value) return value;
    }
  }
  throw new Error("ADMIN_PASSWORD missing");
}

function sql(query) {
  return execFileSync("psql", [databaseUrl(), "-At", "-c", query], { encoding: "utf8" }).trim();
}

function one(query) {
  const text = sql(query);
  return text ? text.split("\n")[0].split("|") : [];
}

const actorEmail = "owner.nimbus@hireiq.local";
const foreignCompany = Number(sql(`SELECT id FROM "Company" WHERE id <> 1 ORDER BY id LIMIT 1`));
const jobId = one(`SELECT id FROM "Job" WHERE "companyId" = ${foreignCompany} ORDER BY id LIMIT 1`)[0];
const candidateId = one(
  `SELECT c.id FROM "Candidate" c WHERE c."companyId" = ${foreignCompany} ORDER BY c.id LIMIT 1`,
)[0];
const applicationId = one(
  `SELECT id FROM "Application" WHERE "companyId" = ${foreignCompany} ORDER BY id LIMIT 1`,
)[0];
const interviewerId = one(
  `SELECT i.id FROM "Interviewer" i WHERE EXISTS (SELECT 1 FROM "Job" j WHERE j."assignedInterviewerId" = i.id AND j."companyId" = ${foreignCompany}) AND NOT EXISTS (SELECT 1 FROM "Job" j WHERE j."assignedInterviewerId" = i.id AND j."companyId" = 1) ORDER BY i.id LIMIT 1`,
)[0];
const billingId = one(
  `SELECT id FROM "BillingRecord" WHERE "companyId" = ${foreignCompany} ORDER BY id LIMIT 1`,
)[0];
const requirementId = jobId;

const paths = [
  jobId && `/dashboard/jobs/${jobId}`,
  jobId && `/dashboard/jobs/${jobId}/review`,
  jobId && `/dashboard/jobs/${jobId}/interviews`,
  jobId && `/dashboard/jobs/${jobId}/assessment`,
  jobId && `/dashboard/requirements/${requirementId}`,
  candidateId && `/dashboard/candidates/${candidateId}`,
  interviewerId && `/dashboard/interviewers/${interviewerId}`,
  jobId && `/client/requirements/${jobId}`,
  jobId && applicationId && `/client/requirements/${jobId}/candidates/${applicationId}`,
  jobId && applicationId && `/client/requirements/${jobId}/relevance/${applicationId}`,
  interviewerId && `/client/interviewers/${interviewerId}`,
  billingId && `/client/billing/${billingId}`,
  billingId && `/dashboard/billing/${billingId}`,
  jobId && `/interviewer/requirements/${jobId}`,
  jobId && applicationId && `/interviewer/requirements/${jobId}/candidates/${applicationId}`,
  candidateId && `/api/candidates/${candidateId}/photo`,
  applicationId && `/api/applications/${applicationId}/offer-letter`,
  jobId && `/api/requirements/${jobId}/export`,
].filter(Boolean);

const jar = new Map();

function store(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const cookie of raw) {
    const [pair] = cookie.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function request(path, init = {}) {
  const response = await fetch(base + path, {
    redirect: "manual",
    signal: AbortSignal.timeout(60000),
    ...init,
    headers: {
      ...(init.headers ?? {}),
      cookie: cookieHeader(),
    },
  });
  store(response);
  return response;
}

const csrfResponse = await request("/api/auth/csrf");
const csrf = (await csrfResponse.json()).csrfToken;
const body = new URLSearchParams({
  csrfToken: csrf,
  email: actorEmail,
  password: password(),
  callbackUrl: `${base}/client`,
  json: "true",
});
const login = await request("/api/auth/callback/credentials", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body,
});
if (login.status !== 200 && login.status !== 302) {
  console.error(`login failed ${login.status}`);
  process.exit(1);
}

console.log(`actor ${actorEmail} foreignCompany ${foreignCompany}`);
console.log(`${"status".padEnd(8)} path`);
let leaks = 0;
let timeouts = 0;
for (const path of paths) {
  let response;
  try {
    response = await request(path);
  } catch {
    console.log(`${"timeout".padEnd(8)} ${path}`);
    timeouts += 1;
    continue;
  }
  const location = response.headers.get("location") ?? "";
  const body = response.status === 200 ? await response.text() : "";
  const hidden = body.includes("This page could not be found") || body.includes("NEXT_HTTP_ERROR_FALLBACK");
  const shown = response.status === 200 && !hidden;
  console.log(`${String(hidden ? "404*" : response.status).padEnd(8)} ${path}${location ? ` -> ${location}` : ""}`);
  if (shown) leaks += 1;
}
console.log(`routes ${paths.length} http 200 ${leaks} timeouts ${timeouts}`);
if (leaks > 0) process.exit(1);
