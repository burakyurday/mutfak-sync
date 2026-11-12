#!/usr/bin/env bash
set -euo pipefail

container="mutfak-hub-schema-test-$$"
cleanup(){ docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --name "$container" -e POSTGRES_PASSWORD=mutfak_test_only -d postgres:15-alpine >/dev/null
for _ in $(seq 1 30); do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container" pg_isready -U postgres >/dev/null
docker exec "$container" psql -U postgres -v ON_ERROR_STOP=1 -c "create role authenticated nologin; create role anon nologin; create role service_role nologin bypassrls; create schema auth; create table auth.users(id uuid primary key default gen_random_uuid(),email text); create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';" >/dev/null
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/202611120001_hub_core.sql >/dev/null
docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/hub_rls.sql >/dev/null
echo "Hub migration and RLS tests passed."
