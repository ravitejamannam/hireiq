#!/usr/bin/env bash
# Dump the local HireIQ database, restore it into a throwaway database, and
# compare row counts. Does not print the connection string.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
url="$(python3 - "$root" <<'PY'
import sys
root = sys.argv[1]
url = ""
for line in open(root + "/.env"):
    if line.startswith("DATABASE_URL="):
        url = line.split("=", 1)[1].strip().strip('"').strip("'")
if not url:
    raise SystemExit("DATABASE_URL is missing")
print(url)
PY
)"

stamp="$(date +%Y%m%d%H%M%S)"
dump="/tmp/hireiq-backup-${stamp}.dump"
restore_db="hireiq_restore_${stamp}"

echo "dumping"
pg_dump "$url" --format=custom --no-owner --file="$dump"
echo "dump bytes $(wc -c < "$dump")"

admin_url="$(python3 - "$url" <<'PY'
import sys
from urllib.parse import urlparse, urlunparse
u = urlparse(sys.argv[1])
print(urlunparse(u._replace(path="/postgres")))
PY
)"
psql "$admin_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${restore_db}\""
psql "$admin_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${restore_db}\""

restore_url="$(python3 - "$url" "$restore_db" <<'PY'
import sys
from urllib.parse import urlparse, urlunparse
u = urlparse(sys.argv[1])
print(urlunparse(u._replace(path="/" + sys.argv[2])))
PY
)"

echo "restoring"
pg_restore --no-owner --no-acl --dbname="$restore_url" "$dump"

python3 - "$url" "$restore_url" <<'PY'
import subprocess, sys
source, restored = sys.argv[1], sys.argv[2]

def counts(url):
    sql = """
    SELECT format('%I.%I', n.nspname, c.relname)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public'
    ORDER BY 1
    """
    names = subprocess.check_output(["psql", url, "-At", "-c", sql], text=True).split()
    rows = {}
    for name in names:
        count = subprocess.check_output(["psql", url, "-At", "-c", f"SELECT count(*) FROM {name}"], text=True).strip()
        rows[name] = int(count)
    return rows

left, right = counts(source), counts(restored)
keys = sorted(set(left) | set(right))
mismatches = []
print(f"{'table':40} {'source':>10} {'restore':>10}")
for key in keys:
    a, b = left.get(key), right.get(key)
    mark = "" if a == b else " DIFF"
    if a != b:
        mismatches.append(key)
    print(f"{key:40} {str(a):>10} {str(b):>10}{mark}")
print(f"tables {len(keys)} mismatches {len(mismatches)}")
if mismatches:
    raise SystemExit(1)
PY

rm -f "$dump"
psql "$admin_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE \"${restore_db}\""
echo "restore matched source row counts"
