#!/bin/bash
set -a
source "$(dirname "$0")/../.env"
set +a
DB="$DATABASE_URL"
BASE="${BASE:-http://localhost:4000}"
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ✓ $1"; else FAIL=$((FAIL+1)); echo "  ✗ $1 [got: $2 | want: $3]"; fi }
q() { psql "$DB" -t -A -c "$1"; }

echo "════ SECTION 1: PUBLIC RAIL ════"
psql "$DB" -c 'DELETE FROM "AuthRateLimit";' > /dev/null
TOKEN=$(q 'SELECT split_part("applyUrlSnapshot", '"'"'/apply/'"'"', 2) FROM "JobDistribution" WHERE "applyUrlSnapshot" IS NOT NULL LIMIT 1;')
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/apply/$TOKEN")
check "apply page loads" "$CODE" "200"

printf 'AZ Test Candidate\nSenior Backend Engineer\nSkills: Go, Postgres, Kafka\n' > /tmp/az-resume.txt
UP=$(curl -s -X POST "$BASE/api/apply/$TOKEN/resume" -H "Origin: $BASE" -F "file=@/tmp/az-resume.txt")
STATUS=$(echo "$UP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('parseStatus',''))" 2>/dev/null)
CLAIM=$(echo "$UP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('resumeClaim',''))" 2>/dev/null)
check "resume pre-upload PARSED" "$STATUS" "PARSED"
[ -n "$CLAIM" ]; check "claim issued" "$([ -n "$CLAIM" ] && echo yes || echo no)" "yes"

KEY=$(uuidgen | tr 'A-Z' 'a-z')
R=$(curl -s -X POST "$BASE/api/apply/$TOKEN" -H "Content-Type: application/json" -H "Origin: $BASE" -H "Idempotency-Key: $KEY" -d "{\"name\":\"AZ Test\",\"email\":\"az.test@example.com\",\"consent\":true,\"coverLetter\":\"AZ run\",\"resumeClaim\":\"$CLAIM\"}")
OK=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['success'])" 2>/dev/null)
check "application submitted" "$OK" "True"
ATESS=$(echo "$R" | python3 -c "import sys,json;d=json.load(sys.stdin);u=d.get('assessmentUrl','');print(u.split('/assess/')[-1] if u else '')" 2>/dev/null)
check "assessment invite issued" "$([ -n "$ATESS" ] && echo yes || echo no)" "yes"

R2=$(curl -s -X POST "$BASE/api/apply/$TOKEN" -H "Content-Type: application/json" -H "Origin: $BASE" -H "Idempotency-Key: $KEY" -d '{"name":"AZ Test","email":"az.test@example.com","consent":true}')
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
SCORE=$(curl -s -X POST "$BASE/api/assess/$ATESS" -H "Content-Type: application/json" -H "Origin: $BASE" -d "$ANSWERS" | python3 -c "
import sys, json
d = json.load(sys.stdin)
# perfect score when answering all-correct; max reflects active bank size
print('PERFECT' if d.get('score') == d.get('maxScore') else 'MISMATCH')" 2>/dev/null)
check "assessment auto-scored (perfect)" "$SCORE" "PERFECT"

RE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/assess/$ATESS" -H "Content-Type: application/json" -H "Origin: $BASE" -d '{"answers":{"1":0}}')
check "one-shot enforced" "$RE" "409"

LEAD=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/apply/$TOKEN/leaderboard")
PII=$(curl -s "$BASE/apply/$TOKEN/leaderboard" | grep -c "az.test@example.com")
check "leaderboard renders" "$LEAD" "200"
check "leaderboard PII-free" "$PII" "0"

echo "════ SECTION 2: FEEDS + GOOGLE JOBS ════"
cd ~/hireiq-app
FTOKEN=$(npx tsx -e "import 'dotenv/config'; import('./lib/jobs/public-feed/feed-token').then(m=>{console.log(m.generateFeedToken(1));process.exit(0)})" 2>/dev/null | tail -1)
cd - > /dev/null
FC=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/feeds/jobs.xml?company=1&token=$FTOKEN")
check "XML feed valid token" "$FC" "200"
FBAD=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/feeds/jobs.xml?company=1&token=tampered")
check "feed tampered -> 403" "$FBAD" "403"
JLD=$(curl -s "$BASE/jobs/1" | grep -c '"@type":"JobPosting"')
check "Google Jobs JSON-LD" "$([ "$JLD" -ge 1 ] && echo yes || echo no)" "yes"
J404=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/jobs/999999")
check "public job soft-404 fixed" "$J404" "404"

echo "════ SECTION 3: ROLES ════"
JAR=/tmp/az-admin.txt; rm -f $JAR
CSRF=$(curl -s -c $JAR "$BASE/api/auth/csrf" | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl -s -b $JAR -c $JAR -X POST "$BASE/api/auth/callback/credentials" -H "Content-Type: application/x-www-form-urlencoded" --data-urlencode "csrfToken=$CSRF" --data-urlencode "email=${ADMIN_EMAIL:-admin@hireiq.local}" --data-urlencode "password=${ADMIN_PASSWORD}" -o /dev/null
SESS=$(curl -s -b $JAR "$BASE/api/auth/session" | python3 -c "import sys,json;print(json.load(sys.stdin).get('user',{}).get('role','NONE'))")
check "ADMIN session role" "$SESS" "ADMIN"
for u in "/dashboard/calibration" "/dashboard/assessment-bank" "/dashboard/integrations" "/dashboard/integrations/feeds" "/dashboard/requirements/1/blueprint"; do
  C=$(curl -s -b $JAR -o /dev/null -w "%{http_code}" "$BASE$u")
  check "admin page $u" "$C" "200"
done

# client + interviewer isolation
rm -f /tmp/az-c.txt /tmp/az-i.txt
C2=$(curl -s -c /tmp/az-c.txt "$BASE/api/auth/csrf" | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl -s -b /tmp/az-c.txt -c /tmp/az-c.txt -X POST "$BASE/api/auth/callback/credentials" -H "Content-Type: application/x-www-form-urlencoded" --data-urlencode "csrfToken=$C2" --data-urlencode "email=owner.nimbus@hireiq.local" --data-urlencode "password=${BOOTSTRAP_PASSWORD:-$ADMIN_PASSWORD}" -o /dev/null
I2=$(curl -s -c /tmp/az-i.txt "$BASE/api/auth/csrf" | python3 -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl -s -b /tmp/az-i.txt -c /tmp/az-i.txt -X POST "$BASE/api/auth/callback/credentials" -H "Content-Type: application/x-www-form-urlencoded" --data-urlencode "csrfToken=$I2" --data-urlencode "email=interviewer.arjun@hireiq.local" --data-urlencode "password=${BOOTSTRAP_PASSWORD:-$ADMIN_PASSWORD}" -o /dev/null
CC=$(curl -s -b /tmp/az-c.txt -o /dev/null -w "%{http_code}" "$BASE/client/requirements")
IC=$(curl -s -b /tmp/az-i.txt -o /dev/null -w "%{http_code}" "$BASE/interviewer/requirements")
check "CLIENT portal" "$CC" "200"
check "INTERVIEWER portal" "$IC" "200"
XT=$(curl -s -b /tmp/az-c.txt -o /dev/null -w "%{http_code}" "$BASE/client/requirements/1")
check "client sees own requirement 1" "$XT" "200"

echo "════ SECTION 4: INTEGRITY + DECISION SUPPORT ════"
AZC=$(psql "$DB" -t -A -c 'SELECT id FROM "Candidate" WHERE name='\''AZ Test'\'' LIMIT 1;')
SIGS=$(curl -s -b $JAR "$BASE/dashboard/candidates/$AZC" | grep -c "Decision support")
check "decision-support signals render" "$([ "$SIGS" -ge 1 ] && echo yes || echo no)" "yes"
CAL=$(curl -s -b $JAR -o /dev/null -w "%{http_code}" "$BASE/dashboard/calibration")
check "calibration page" "$CAL" "200"

echo "════ SECTION 5: SECURITY GUARDS ════"
ANON=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/dashboard/candidates/223")
check "anon -> admin candidate page blocked" "$ANON" "307"
IVX=$(curl -s -b /tmp/az-i.txt -o /dev/null -w "%{http_code}" "$BASE/api/resumes/upload" -X POST)
check "interviewer -> resume upload API blocked" "$IVX" "401"

echo "════════════════════════════════"
echo "TOTALS: PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ] && echo "🎉 ALL SYSTEMS GREEN"
