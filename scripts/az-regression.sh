#!/bin/bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi
if [ -z "${AZ_DATABASE_URL:-}" ]; then
  AZ_DATABASE_URL="${DATABASE_URL:-}"
fi
export AZ_DATABASE_URL
if [ -z "${AZ_DATABASE_URL:-}" ]; then
  echo "AZ_DATABASE_URL is required. Set it to the hireiq_e2e database." >&2
  exit 1
fi
if [ -z "${AZ_ADMIN_EMAIL:-}" ]; then AZ_ADMIN_EMAIL="${ADMIN_EMAIL:-}"; fi
if [ -z "${AZ_ADMIN_PASSWORD:-}" ]; then AZ_ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"; fi
export AZ_ADMIN_EMAIL AZ_ADMIN_PASSWORD
if ! DB_NAME=$(node --input-type=module -e '
const raw = process.env.AZ_DATABASE_URL;
let name = "";
try {
  name = new URL(raw).pathname.replace(/^\//, "").split("/")[0];
} catch {
  console.error("AZ_DATABASE_URL is not a valid database URL.");
  process.exit(2);
}
const disposable = name.startsWith("hireiq_e2e_disp_") && name.length > "hireiq_e2e_disp_".length;
if (name !== "hireiq_e2e" && !disposable) {
  console.error("AZ_DATABASE_URL must use hireiq_e2e or a hireiq_e2e_disp_ database.");
  process.exit(2);
}
process.stdout.write(name);
'); then
  exit 1
fi
unset DB_NAME
DB="$AZ_DATABASE_URL"
if [ -z "${BASE:-}" ]; then
  echo "BASE is required. Set it to the dedicated E2E server, not the existing port-4000 server." >&2
  exit 1
fi
if [ -z "${AZ_ADMIN_EMAIL:-}" ] || [ -z "${AZ_ADMIN_PASSWORD:-}" ]; then
  echo "AZ_ADMIN_EMAIL and AZ_ADMIN_PASSWORD are required for the A-Z admin login." >&2
  exit 1
fi
PASS=0; FAIL=0
CREATED_CLAIM=""
cleanup_created_rows() {
  if [ -z "${CREATED_CLAIM:-}" ]; then
    return 0
  fi
  CLAIM="$CREATED_CLAIM" DB="$DB" HIREIQ_ROOT="$ROOT" node --input-type=module << 'EOF'
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const { hashSecureToken } = await import(pathToFileURL(`${process.env.HIREIQ_ROOT}/lib/auth/secure-token.ts`).href);
const db = process.env.DB;
const claim = process.env.CLAIM;
if (!db || !claim) process.exit(0);
const hash = hashSecureToken(claim);
function q(sql) {
  try {
    return execFileSync("psql", [db, "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8" }).trim();
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
    const safe = stderr.replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3).join(" ");
    console.error(safe ? `Cleanup SQL failed: ${safe}` : "Cleanup SQL failed.");
    process.exit(1);
  }
}
function residue(message) {
  console.error(message);
}
const uploads = q(`SELECT id::text || '|' || COALESCE("hostedApplySubmissionId"::text, '') FROM "HostedApplyResumeUpload" WHERE "claimTokenHash" = '${hash}'`);
const lines = uploads ? uploads.split("\n").filter(Boolean) : [];
if (lines.length !== 1) {
  residue("Cleanup left residue: resume claim did not match exactly one upload.");
  process.exit(0);
}
const [uploadId, submissionId] = lines[0].split("|");
if (!submissionId) {
  q(`DELETE FROM "HostedApplyResumeUpload" WHERE id = ${Number(uploadId)} AND "claimTokenHash" = '${hash}' AND "hostedApplySubmissionId" IS NULL`);
  process.exit(0);
}
const events = q(`SELECT id::text || '|' || COALESCE("applicationId"::text, '') || '|' || COALESCE("candidateId"::text, '') FROM "ApplicationIngestionEvent" WHERE "hostedApplySubmissionId" = ${Number(submissionId)}`);
const eventLines = events ? events.split("\n").filter(Boolean) : [];
if (eventLines.length !== 1) {
  residue(`Cleanup left residue: submission ${submissionId} is not tied to exactly one ingestion event.`);
  process.exit(0);
}
const [eventId, applicationId, candidateId] = eventLines[0].split("|");
if (!applicationId || !candidateId) {
  residue(`Cleanup left residue: ingestion event ${eventId} has no application or candidate.`);
  process.exit(0);
}
const otherApps = q(`SELECT count(*) FROM "Application" WHERE "candidateId" = ${Number(candidateId)} AND id <> ${Number(applicationId)}`);
if (otherApps !== "0") {
  residue(`Cleanup left residue: candidate ${candidateId} has other applications.`);
  process.exit(0);
}
q(`DELETE FROM "AssessmentAnswer" WHERE "attemptId" IN (SELECT t.id FROM "AssessmentAttempt" t JOIN "AssessmentInvite" i ON i.id = t."inviteId" WHERE i."applicationId" = ${Number(applicationId)})`);
q(`DELETE FROM "AssessmentAttempt" WHERE "inviteId" IN (SELECT id FROM "AssessmentInvite" WHERE "applicationId" = ${Number(applicationId)})`);
q(`DELETE FROM "AssessmentInvite" WHERE "applicationId" = ${Number(applicationId)}`);
q(`DELETE FROM "CandidateEvidence" WHERE "applicationId" = ${Number(applicationId)}`);
q(`DELETE FROM "CandidateResumeDocument" WHERE "applicationId" = ${Number(applicationId)}`);
q(`UPDATE "HostedApplyResumeUpload" SET "hostedApplySubmissionId" = NULL WHERE id = ${Number(uploadId)}`);
q(`DELETE FROM "ApplicationIngestionEvent" WHERE id = ${Number(eventId)} AND "hostedApplySubmissionId" = ${Number(submissionId)}`);
q(`DELETE FROM "HostedApplySubmission" WHERE id = ${Number(submissionId)}`);
q(`DELETE FROM "HostedApplyResumeUpload" WHERE id = ${Number(uploadId)} AND "claimTokenHash" = '${hash}'`);
q(`DELETE FROM "Application" WHERE id = ${Number(applicationId)}`);
q(`DELETE FROM "Candidate" WHERE id = ${Number(candidateId)} AND NOT EXISTS (SELECT 1 FROM "Application" WHERE "candidateId" = ${Number(candidateId)})`);
EOF
}
trap cleanup_created_rows EXIT
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✓ $1"; else FAIL=$((FAIL+1)); echo "  ✗ $1 [got: $2 | want: $3]"; fi }
q() { psql "$DB" -t -A -c "$1"; }

echo "════ SECTION 1: PUBLIC RAIL ════"
HOSTED_COUNT=$(q 'SELECT count(*) FROM "JobDistribution" WHERE "companyId" = 1 AND "jobId" = 3 AND "applyMode" = '"'"'HIREIQ_HOSTED'"'"' AND "status" = '"'"'PUBLISHED'"'"' AND "applyUrlSnapshot" IS NOT NULL;')
if [ "$HOSTED_COUNT" != "1" ]; then
  echo "Job 3 must have exactly one published hosted apply link. Found ${HOSTED_COUNT:-0}." >&2
  exit 1
fi
TOKEN=$(q 'SELECT split_part("applyUrlSnapshot", '"'"'/apply/'"'"', 2) FROM "JobDistribution" WHERE "companyId" = 1 AND "jobId" = 3 AND "applyMode" = '"'"'HIREIQ_HOSTED'"'"' AND "status" = '"'"'PUBLISHED'"'"' AND "applyUrlSnapshot" IS NOT NULL;')
if [ -z "${TOKEN//[[:space:]]/}" ] || [[ "$TOKEN" == */* ]]; then
  echo "Job 3 hosted apply link does not contain a single apply token." >&2
  exit 1
fi
SNAPSHOT=$(q 'SELECT "applyUrlSnapshot" FROM "JobDistribution" WHERE "companyId" = 1 AND "jobId" = 3 AND "applyMode" = '"'"'HIREIQ_HOSTED'"'"' AND "status" = '"'"'PUBLISHED'"'"' AND "applyUrlSnapshot" IS NOT NULL;')
STORED_HASH=$(q 'SELECT t."tokenHash" FROM "ApplyToken" t JOIN "JobDistribution" d ON d.id = t."distributionId" WHERE d."companyId" = 1 AND d."jobId" = 3 AND d."applyMode" = '"'"'HIREIQ_HOSTED'"'"' AND d.status = '"'"'PUBLISHED'"'"' AND t."revokedAt" IS NULL;')
if ! BASE="$BASE" SNAPSHOT="$SNAPSHOT" TOKEN="$TOKEN" STORED_HASH="$STORED_HASH" HIREIQ_ROOT="$ROOT" node --input-type=module << 'EOF'
import { pathToFileURL } from "node:url";
const { hashSecureToken } = await import(pathToFileURL(`${process.env.HIREIQ_ROOT}/lib/auth/secure-token.ts`).href);
const base = new URL(process.env.BASE);
const snapshot = new URL(process.env.SNAPSHOT);
const hashes = (process.env.STORED_HASH || "").split("\n").filter(Boolean);
if (snapshot.origin !== base.origin) process.exit(2);
if (hashes.length !== 1) process.exit(3);
if (hashSecureToken(process.env.TOKEN) !== hashes[0]) process.exit(4);
EOF
then
  echo "Job 3 hosted apply link does not match BASE or its unrevoked token." >&2
  exit 1
fi
unset SNAPSHOT STORED_HASH
OWNER_OK=$(q 'SELECT count(*) FROM "User" u WHERE lower(u.email) = '"'"'owner.nimbus@hireiq.local'"'"' AND u.role = '"'"'CLIENT'"'"' AND u."disabledAt" IS NULL AND u."emailVerifiedAt" IS NOT NULL AND EXISTS (SELECT 1 FROM "OrganizationMember" m JOIN "Company" c ON c.id = m."companyId" WHERE m."userId" = u.id AND m.status = '"'"'ACTIVE'"'"' AND m."companyId" = u."companyId");')
if [ "$OWNER_OK" != "1" ]; then
  echo "owner.nimbus@hireiq.local is missing or not an enabled verified client with an active company membership." >&2
  exit 1
fi
INTERVIEWER_OK=$(q 'SELECT count(*) FROM "User" u JOIN "Interviewer" i ON i.id = u."interviewerId" WHERE lower(u.email) = '"'"'interviewer.arjun@hireiq.local'"'"' AND u.role = '"'"'INTERVIEWER'"'"' AND u."disabledAt" IS NULL;')
if [ "$INTERVIEWER_OK" != "1" ]; then
  echo "interviewer.arjun@hireiq.local is missing or not an enabled interviewer with a profile." >&2
  exit 1
fi
CODE=$(curl --connect-timeout 5 --max-time 60 -s -o /dev/null -w "%{http_code}" "$BASE/apply/$TOKEN")
check "apply page loads" "$CODE" "200"

printf '%s\n' \
  'AZ Test Candidate' \
  'Senior Backend Engineer' \
  'Summary: Backend engineer with experience building hiring systems, APIs, and data services.' \
  'Experience: Designed services for candidate intake, evidence storage, and interview scheduling.' \
  'Built reliable PostgreSQL schemas, background jobs, and operational dashboards for recruiting teams.' \
  'Education: Bachelor of Engineering in Computer Science.' \
  'Skills: Go, PostgreSQL, Kafka, SQL, TypeScript, Docker, Linux, testing, and system design.' \
  > /tmp/az-resume.txt
UP=$(curl --connect-timeout 5 --max-time 60 -s -X POST "$BASE/api/apply/$TOKEN/resume" -H "Origin: $BASE" -F "file=@/tmp/az-resume.txt")
STATUS=$(echo "$UP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('parseStatus',''))" 2>/dev/null)
CLAIM=$(echo "$UP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('resumeClaim',''))" 2>/dev/null)
if [ -n "$CLAIM" ]; then
  CREATED_CLAIM="$CLAIM"
fi
check "resume pre-upload PARSED" "$STATUS" "PARSED"
[ -n "$CLAIM" ]; check "claim issued" "$([ -n "$CLAIM" ] && echo yes || echo no)" "yes"

KEY=$(uuidgen | tr 'A-Z' 'a-z')
R=$(curl --connect-timeout 5 --max-time 60 -s -X POST "$BASE/api/apply/$TOKEN" -H "Content-Type: application/json" -H "Origin: $BASE" -H "Idempotency-Key: $KEY" -d "{\"name\":\"AZ Test\",\"email\":\"az.test@example.com\",\"consent\":true,\"coverLetter\":\"AZ run\",\"resumeClaim\":\"$CLAIM\"}")
OK=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['success'])" 2>/dev/null)
check "application submitted" "$OK" "True"
ATESS=$(echo "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);u=d.get('assessmentUrl','');print(u.split('/assess/')[-1] if u else '')" 2>/dev/null)
check "assessment invite issued" "$([ -n "$ATESS" ] && echo yes || echo no)" "yes"

R2=$(curl --connect-timeout 5 --max-time 60 -s -X POST "$BASE/api/apply/$TOKEN" -H "Content-Type: application/json" -H "Origin: $BASE" -H "Idempotency-Key: $KEY" -d '{"name":"AZ Test","email":"az.test@example.com","consent":true}')
OK2=$(echo "$R2" | python3 -c "import sys,json;print(json.load(sys.stdin)['success'])" 2>/dev/null)
SUBS=$(psql "$DB" -t -A -c 'SELECT count(*) FROM "HostedApplySubmission" WHERE "emailNormalized"='"'"'az.test@example.com'"'"';')
check "idempotent replay success" "$OK2" "True"
check "no duplicate submission" "$SUBS" "1"

EV=$(psql "$DB" -t -A -c 'SELECT count(*) FROM "CandidateEvidence" e JOIN "Candidate" c ON c.id=e."candidateId" WHERE c.name='"'"'AZ Test'"'"' AND e."sourceType" IN ('"'"'RESUME_DOCUMENT'"'"', '"'"'HOSTED_APPLY_SUBMISSION'"'"');')
check "evidence chain captured" "$([ "$EV" -ge 2 ] && echo yes || echo no)" "yes"

APPID=$(psql "$DB" -t -A -c 'SELECT a.id FROM "Application" a JOIN "Candidate" c ON c.id=a."candidateId" WHERE c.name='"'"'AZ Test'"'"' ORDER BY a.id DESC LIMIT 1;')
psql "$DB" -t -A -c "SELECT \"scoringKey\" FROM \"AssessmentInvite\" WHERE \"applicationId\" = $APPID;" > /tmp/az-key.json
ANSWERS=$(python3 -c "
import json
key = json.loads(open('/tmp/az-key.json').read().strip())
print(json.dumps({'answers': {qid: v['correctIndex'] for qid, v in key.items()}}))")
SCORE=$(curl --connect-timeout 5 --max-time 60 -s -X POST "$BASE/api/assess/$ATESS" -H "Content-Type: application/json" -H "Origin: $BASE" -d "$ANSWERS" | python3 -c "
import sys, json
d = json.load(sys.stdin)
# perfect score when answering all-correct; max reflects active bank size
print('PERFECT' if d.get('score') == d.get('maxScore') else 'MISMATCH')" 2>/dev/null)
check "assessment auto-scored (perfect)" "$SCORE" "PERFECT"

RE=$(curl --connect-timeout 5 --max-time 60 -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/assess/$ATESS" -H "Content-Type: application/json" -H "Origin: $BASE" -d '{"answers":{"1":0}}')
check "one-shot enforced" "$RE" "409"

LEAD=$(curl --connect-timeout 5 --max-time 60 -s -o /dev/null -w "%{http_code}" "$BASE/apply/$TOKEN/leaderboard")
PII=$(curl --connect-timeout 5 --max-time 60 -s "$BASE/apply/$TOKEN/leaderboard" | grep -c "az.test@example.com")
check "leaderboard renders" "$LEAD" "200"
check "leaderboard PII-free" "$PII" "0"

echo "════ SECTION 2: FEEDS + GOOGLE JOBS ════"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FTOKEN=$(cd "$REPO_ROOT" && npx tsx -e "import 'dotenv/config'; import('./lib/jobs/public-feed/feed-token').then(m=>{console.log(m.generateFeedToken(1));process.exit(0)})" 2>/dev/null | tail -1)
FC=$(curl --connect-timeout 5 --max-time 60 -s -o /dev/null -w "%{http_code}" "$BASE/feeds/jobs.xml?company=1&token=$FTOKEN")
check "XML feed valid token" "$FC" "200"
FBAD=$(curl --connect-timeout 5 --max-time 60 -s -o /dev/null -w "%{http_code}" "$BASE/feeds/jobs.xml?company=1&token=tampered")
check "feed tampered -> 403" "$FBAD" "403"
JLD=$(curl --connect-timeout 5 --max-time 60 -s "$BASE/jobs/1" | grep -c '"@type":"JobPosting"')
check "Google Jobs JSON-LD" "$([ "$JLD" -ge 1 ] && echo yes || echo no)" "yes"
J404=$(curl --connect-timeout 5 --max-time 60 -s -o /dev/null -w "%{http_code}" "$BASE/jobs/999999")
check "public job soft-404 fixed" "$J404" "404"

echo "════ SECTION 3: ROLES ════"
JAR=/tmp/az-admin.txt; rm -f $JAR
CSRF=$(curl --connect-timeout 5 --max-time 60 -s -c $JAR "$BASE/api/auth/csrf" | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl --connect-timeout 5 --max-time 60 -s -b $JAR -c $JAR -X POST "$BASE/api/auth/callback/credentials" -H "Content-Type: application/x-www-form-urlencoded" --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=${AZ_ADMIN_EMAIL}" --data-urlencode "password=${AZ_ADMIN_PASSWORD}" -o /dev/null
SESS=$(curl --connect-timeout 5 --max-time 60 -s -b $JAR "$BASE/api/auth/session" | python3 -c "import sys,json;print(json.load(sys.stdin).get('user',{}).get('role','NONE'))")
check "ADMIN session role" "$SESS" "ADMIN"
for u in "/dashboard/calibration" "/dashboard/assessment-bank" "/dashboard/integrations" "/dashboard/integrations/feeds" "/dashboard/requirements/1/blueprint"; do
  C=$(curl --connect-timeout 5 --max-time 60 -s -b $JAR -o /dev/null -w "%{http_code}" "$BASE$u")
  check "admin page $u" "$C" "200"
done

# client + interviewer isolation
rm -f /tmp/az-c.txt /tmp/az-i.txt
C2=$(curl --connect-timeout 5 --max-time 60 -s -c /tmp/az-c.txt "$BASE/api/auth/csrf" | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl --connect-timeout 5 --max-time 60 -s -b /tmp/az-c.txt -c /tmp/az-c.txt -X POST "$BASE/api/auth/callback/credentials" -H "Content-Type: application/x-www-form-urlencoded" --data-urlencode "csrfToken=$C2" --data-urlencode "email=owner.nimbus@hireiq.local" --data-urlencode "password=${BOOTSTRAP_PASSWORD:-$ADMIN_PASSWORD}" -o /dev/null
I2=$(curl --connect-timeout 5 --max-time 60 -s -c /tmp/az-i.txt "$BASE/api/auth/csrf" | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl --connect-timeout 5 --max-time 60 -s -b /tmp/az-i.txt -c /tmp/az-i.txt -X POST "$BASE/api/auth/callback/credentials" -H "Content-Type: application/x-www-form-urlencoded" --data-urlencode "csrfToken=$I2" --data-urlencode "email=interviewer.arjun@hireiq.local" --data-urlencode "password=${BOOTSTRAP_PASSWORD:-$ADMIN_PASSWORD}" -o /dev/null
CC=$(curl --connect-timeout 5 --max-time 60 -s -b /tmp/az-c.txt -o /dev/null -w "%{http_code}" "$BASE/client/requirements")
IC=$(curl --connect-timeout 5 --max-time 60 -s -b /tmp/az-i.txt -o /dev/null -w "%{http_code}" "$BASE/interviewer/requirements")
check "CLIENT portal" "$CC" "200"
check "INTERVIEWER portal" "$IC" "200"
XT=$(curl --connect-timeout 5 --max-time 60 -s -b /tmp/az-c.txt -o /dev/null -w "%{http_code}" "$BASE/client/requirements/1")
check "client sees own requirement 1" "$XT" "200"

echo "════ SECTION 4: INTEGRITY + DECISION SUPPORT ════"
AZC=$(psql "$DB" -t -A -c 'SELECT id FROM "Candidate" WHERE name='\''AZ Test'\'' LIMIT 1;')
SIGS=$(curl --connect-timeout 5 --max-time 60 -s -b $JAR "$BASE/dashboard/candidates/$AZC" | grep -c "Decision support")
check "decision-support signals render" "$([ "$SIGS" -ge 1 ] && echo yes || echo no)" "yes"
CAL=$(curl --connect-timeout 5 --max-time 60 -s -b $JAR -o /dev/null -w "%{http_code}" "$BASE/dashboard/calibration")
check "calibration page" "$CAL" "200"

echo "════ SECTION 5: SECURITY GUARDS ════"
ANON=$(curl --connect-timeout 5 --max-time 60 -s -o /dev/null -w "%{http_code}" "$BASE/dashboard/candidates/223")
check "anon -> admin candidate page blocked" "$ANON" "307"
IVX=$(curl --connect-timeout 5 --max-time 60 -s -b /tmp/az-i.txt -o /dev/null -w "%{http_code}" "$BASE/api/resumes/upload" -X POST)
check "interviewer -> resume upload API blocked" "$IVX" "401"

echo "════════════════════════════════"
echo "TOTALS: PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ] && echo "🎉 ALL SYSTEMS GREEN"
