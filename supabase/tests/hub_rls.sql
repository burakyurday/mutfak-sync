-- Run after the Hub migration against an isolated test database.
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000001','team@example.com'),
 ('00000000-0000-0000-0000-000000000002','client-a@example.com'),
 ('00000000-0000-0000-0000-000000000003','client-b@example.com');
insert into public.hub_profiles(id,display_name) values
 ('00000000-0000-0000-0000-000000000001','Team'),
 ('00000000-0000-0000-0000-000000000002','Client A'),
 ('00000000-0000-0000-0000-000000000003','Client B');
insert into public.hub_team_members(user_id,role) values('00000000-0000-0000-0000-000000000001','admin');
insert into public.hub_organizations(id,name,slug) values
 ('10000000-0000-0000-0000-000000000001','Customer A','customer-a'),
 ('10000000-0000-0000-0000-000000000002','Customer B','customer-b');
insert into public.hub_organization_members(organization_id,user_id) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003');
insert into public.hub_projects(id,organization_id,name,created_by) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Project A','00000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Project B','00000000-0000-0000-0000-000000000001');
insert into public.hub_files(id,organization_id,project_id,name,visibility,state,uploaded_by) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','published.pdf','published','ready','00000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','internal.psd','internal','ready','00000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','upload.zip','customer_upload','ready','00000000-0000-0000-0000-000000000002'),
 ('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','other.pdf','published','ready','00000000-0000-0000-0000-000000000001');

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $$ declare amount integer; begin
 select count(*) into amount from public.hub_organizations;
 if amount<>1 then raise exception 'customer organization isolation failed: %',amount; end if;
 select count(*) into amount from public.hub_files;
 if amount<>2 then raise exception 'customer file visibility failed: %',amount; end if;
 if exists(select 1 from public.hub_files where name in ('internal.psd','other.pdf')) then raise exception 'forbidden file leaked'; end if;
 begin
  insert into public.hub_files(organization_id,project_id,name,visibility,state,uploaded_by) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','forbidden.psd','internal','ready','00000000-0000-0000-0000-000000000002');
  raise exception 'customer internal insert unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
end $$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$ declare amount integer; begin
 select count(*) into amount from public.hub_organizations;
 if amount<>2 then raise exception 'team organization access failed: %',amount; end if;
 select count(*) into amount from public.hub_files;
 if amount<>4 then raise exception 'team file access failed: %',amount; end if;
end $$;
rollback;
