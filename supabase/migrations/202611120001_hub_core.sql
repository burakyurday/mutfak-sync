-- Mutfak Hub core schema. All objects are prefixed to coexist with Mutfak Web.
create extension if not exists pgcrypto;

create table if not exists public.hub_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hub_team_members (
  user_id uuid primary key references public.hub_profiles(id) on delete cascade,
  role text not null check (role in ('admin','staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.hub_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hub_organization_members (
  organization_id uuid not null references public.hub_organizations(id) on delete cascade,
  user_id uuid not null references public.hub_profiles(id) on delete cascade,
  role text not null default 'viewer' check (role in ('manager','editor','viewer')),
  active boolean not null default true,
  invited_by uuid references public.hub_profiles(id),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);

create table if not exists public.hub_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.hub_organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 180),
  status text not null default 'active' check (status in ('active','review','completed','archived')),
  created_by uuid not null references public.hub_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hub_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.hub_organizations(id) on delete cascade,
  project_id uuid not null references public.hub_projects(id) on delete cascade,
  drive_file_id text unique,
  drive_parent_id text,
  name text not null check (char_length(name) between 1 and 255 and name !~ '[\\/]'),
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  checksum text,
  visibility text not null check (visibility in ('internal','published','customer_upload')),
  state text not null default 'uploading' check (state in ('uploading','ready','failed','trashed')),
  preview_status text not null default 'pending' check (preview_status in ('pending','processing','ready','unavailable','failed')),
  preview_path text,
  uploaded_by uuid not null references public.hub_profiles(id),
  published_by uuid references public.hub_profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hub_files_org_project_idx on public.hub_files(organization_id,project_id,updated_at desc);
create index if not exists hub_files_visibility_idx on public.hub_files(organization_id,visibility,state);

create table if not exists public.hub_file_versions (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.hub_files(id) on delete cascade,
  drive_file_id text not null,
  version integer not null check (version > 0),
  size_bytes bigint not null check (size_bytes >= 0),
  checksum text,
  created_by uuid not null references public.hub_profiles(id),
  created_at timestamptz not null default now(),
  unique(file_id,version)
);

create table if not exists public.hub_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.hub_organizations(id) on delete cascade,
  project_id uuid not null references public.hub_projects(id) on delete cascade,
  file_id uuid not null references public.hub_files(id) on delete cascade,
  user_id uuid not null references public.hub_profiles(id) on delete cascade,
  status text not null default 'created' check (status in ('created','uploading','verified','expired','failed')),
  expected_size bigint not null check (expected_size >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.hub_preview_jobs (
  id bigint generated always as identity primary key,
  file_id uuid not null unique references public.hub_files(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','done','failed','unsupported')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hub_activity_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.hub_organizations(id) on delete cascade,
  actor_id uuid references public.hub_profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  audience text not null default 'team' check (audience in ('team','customer')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.hub_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.hub_organizations(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('manager','editor','viewer')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid not null references public.hub_profiles(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create unique index if not exists hub_invitation_pending_email_idx on public.hub_invitations(organization_id,lower(email)) where status='pending';

create or replace function public.hub_touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
do $$ begin
  create trigger hub_profiles_touch before update on public.hub_profiles for each row execute function public.hub_touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger hub_organizations_touch before update on public.hub_organizations for each row execute function public.hub_touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger hub_projects_touch before update on public.hub_projects for each row execute function public.hub_touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger hub_files_touch before update on public.hub_files for each row execute function public.hub_touch_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger hub_preview_jobs_touch before update on public.hub_preview_jobs for each row execute function public.hub_touch_updated_at();
exception when duplicate_object then null; end $$;

create or replace function public.hub_is_team() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.hub_team_members where user_id=auth.uid() and active)
$$;
create or replace function public.hub_is_org_member(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.hub_organization_members where user_id=auth.uid() and organization_id=target and active)
$$;
revoke all on function public.hub_is_team() from public;
revoke all on function public.hub_is_org_member(uuid) from public;
grant execute on function public.hub_is_team() to authenticated;
grant execute on function public.hub_is_org_member(uuid) to authenticated;

alter table public.hub_profiles enable row level security;
alter table public.hub_team_members enable row level security;
alter table public.hub_organizations enable row level security;
alter table public.hub_organization_members enable row level security;
alter table public.hub_projects enable row level security;
alter table public.hub_files enable row level security;
alter table public.hub_file_versions enable row level security;
alter table public.hub_upload_sessions enable row level security;
alter table public.hub_preview_jobs enable row level security;
alter table public.hub_activity_logs enable row level security;
alter table public.hub_invitations enable row level security;

create policy hub_profiles_read on public.hub_profiles for select to authenticated using (id=auth.uid() or public.hub_is_team());
create policy hub_team_self_read on public.hub_team_members for select to authenticated using (user_id=auth.uid() or public.hub_is_team());
create policy hub_org_read on public.hub_organizations for select to authenticated using (public.hub_is_team() or public.hub_is_org_member(id));
create policy hub_members_read on public.hub_organization_members for select to authenticated using (public.hub_is_team() or public.hub_is_org_member(organization_id));
create policy hub_projects_read on public.hub_projects for select to authenticated using (public.hub_is_team() or public.hub_is_org_member(organization_id));
create policy hub_projects_team_write on public.hub_projects for all to authenticated using (public.hub_is_team()) with check (public.hub_is_team());
create policy hub_files_read on public.hub_files for select to authenticated using (public.hub_is_team() or (public.hub_is_org_member(organization_id) and visibility in ('published','customer_upload') and state='ready'));
create policy hub_files_team_update on public.hub_files for update to authenticated using (public.hub_is_team()) with check (public.hub_is_team());
create policy hub_versions_read on public.hub_file_versions for select to authenticated using (exists(select 1 from public.hub_files f where f.id=file_id));
create policy hub_upload_own_read on public.hub_upload_sessions for select to authenticated using (user_id=auth.uid() or public.hub_is_team());
create policy hub_preview_team_only on public.hub_preview_jobs for select to authenticated using (public.hub_is_team());
create policy hub_activity_read on public.hub_activity_logs for select to authenticated using (public.hub_is_team() or (audience='customer' and organization_id is not null and public.hub_is_org_member(organization_id)));
create policy hub_invitations_team_only on public.hub_invitations for all to authenticated using (public.hub_is_team()) with check (public.hub_is_team());

grant select on public.hub_profiles,public.hub_team_members,public.hub_organizations,public.hub_organization_members,public.hub_projects,public.hub_files,public.hub_file_versions,public.hub_upload_sessions,public.hub_activity_logs to authenticated;
grant insert,update,delete on public.hub_projects,public.hub_invitations to authenticated;
grant update on public.hub_files to authenticated;
grant usage,select on all sequences in schema public to authenticated;
