#!/usr/bin/env bash
#
# Run every migration against a real Postgres, then exercise the reward paths.
#
# ## Why this exists
#
# `supabase db reset` and `supabase test db` need Docker, and every environment this repo
# has been developed in so far has not had it. So the SQL — five hundred lines of PL/pgSQL
# that decides what a user is paid — was the one part of the product nothing had ever
# EXECUTED. It typechecked in the sense that `pnpm check:sql` reads it as text; nothing
# had parsed it as SQL, let alone run it.
#
# The first run found nothing, which is the outcome worth writing down: the migrations
# apply in order, the reward paths pay the right amounts, and every one of them refuses a
# second payment. That is a fact about this schema now rather than a hope.
#
# ## What it is NOT
#
# Not a replacement for `supabase test db`. pgTAP is not installed here, so the assertions
# in `supabase/tests/rls.test.sql` still need a real Supabase stack — this checks the same
# PROPERTIES with plain SQL, which is enough to catch a broken plan count or a missing
# revoke, and not enough to retire that file.
#
# Not the platform. `auth.uid()`, the roles and the default grants are stood up below
# because Supabase provides them; if the platform changes what it provides, this diverges
# silently. The grants matter more than they look: without them every write is refused at
# the GRANT layer and an RLS test passes for the wrong reason, which is what the first
# version of this did.
#
# Usage:  bash scripts/db/pg-harness.sh
# Needs:  postgresql-16 server binaries (initdb, pg_ctl) and a non-root user to run them.

set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
RUNDIR=${RUNDIR:-/var/tmp/wq-pg-harness}
PORT=${PGPORT:-55432}
# initdb refuses to run as root, which is the usual state in a container.
RUNAS=${RUNAS:-$( [ "$(id -u)" = "0" ] && echo ubuntu || echo "$(id -un)" )}

as() { if [ "$(id -u)" = "0" ]; then su "$RUNAS" -c "$1"; else bash -c "$1"; fi; }
psq() { as "psql -h $RUNDIR -p $PORT -U postgres -v ON_ERROR_STOP=1 $*"; }

echo "→ cluster in $RUNDIR (as $RUNAS)"
as "$PGBIN/pg_ctl -D $RUNDIR/data stop" >/dev/null 2>&1 || true
rm -rf "$RUNDIR"
mkdir -p "$RUNDIR"; chown "$RUNAS" "$RUNDIR"; chmod 700 "$RUNDIR"
as "$PGBIN/initdb -D $RUNDIR/data -U postgres --auth=trust" >/dev/null
as "$PGBIN/pg_ctl -D $RUNDIR/data -o '-p $PORT -k $RUNDIR -c listen_addresses=' -l $RUNDIR/log start" >/dev/null
trap 'as "$PGBIN/pg_ctl -D $RUNDIR/data stop" >/dev/null 2>&1 || true' EXIT
sleep 2

echo "→ platform scaffolding (auth schema, roles, grants)"
psq -q -f "$ROOT/scripts/db/scaffold.sql"

echo "→ migrations"
cp -r "$ROOT/supabase/migrations" "$RUNDIR/migrations"; chown -R "$RUNAS" "$RUNDIR/migrations"
for f in $(ls "$RUNDIR"/migrations/*.sql | sort); do
  psq -q -f "$f" >/dev/null && echo "  ✓ $(basename "$f")"
done

psq -q -f "$ROOT/scripts/db/grants.sql"

echo "→ properties"
# `-t -q` and stderr to stdout: every assertion reports through `raise notice`, and the
# empty result row of a void function per check is noise around the only output that says
# anything.
psq -t -q -f "$ROOT/scripts/db/assert.sql" 2>&1 | grep -E "✓|✗|ERROR|NOTICE" | sed 's/^psql:[^ ]* //; s/^NOTICE: *//'

echo "→ generated types against the real schema"
as "psql -h $RUNDIR -p $PORT -U postgres -tA -F'|' -c \"select table_name, column_name from information_schema.columns where table_schema='public' order by 1,2\"" > "$RUNDIR/columns.txt"
as "psql -h $RUNDIR -p $PORT -U postgres -tA -F'|' -c \"select p.proname, p.pronargs from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public' order by 1\"" > "$RUNDIR/functions.txt"
node "$ROOT/scripts/db/check-types.mjs" "$ROOT/packages/api/src/database.types.ts" "$RUNDIR/columns.txt" "$RUNDIR/functions.txt"

echo "✓ schema applies and behaves"
