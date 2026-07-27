-- Purpose: Model the Phase 0 approved private-profile contract with synthetic rows.
-- Graph: Own-only browser RLS with separate server-mediated administration.
-- Scope: TEST-ONLY SYNTHETIC AUTHORIZATION GRAPH. NOT A MIGRATION.
-- Security assertion: No public, cross-user, role-table, claim, or helper bypass exists.
-- DO NOT APPLY TO STAGING OR PRODUCTION.

create schema cb_target_graph;

create function cb_target_graph.auth_uid()
returns integer
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::integer
$function$;

create table cb_target_graph.profiles (
  user_id integer primary key,
  display_name text not null,
  account_privacy text not null
    check (account_privacy in ('public', 'private'))
);

create table cb_target_graph.user_roles (
  user_id integer not null,
  role text not null,
  primary key (user_id, role)
);

insert into cb_target_graph.profiles (
  user_id,
  display_name,
  account_privacy
)
values
  (1, 'Synthetic One', 'private'),
  (2, 'Synthetic Two', 'public');

insert into cb_target_graph.user_roles (user_id, role)
values (1, 'member'), (2, 'admin');

alter table cb_target_graph.profiles enable row level security;
alter table cb_target_graph.user_roles enable row level security;

create policy profiles_select_own
on cb_target_graph.profiles
for select
to cb_rls_authenticated
using (cb_target_graph.auth_uid() = user_id);

create policy profiles_service_select
on cb_target_graph.profiles
for select
to cb_rls_service
using (true);

-- Explicit service policies model operational access without browser membership or BYPASSRLS.
create policy user_roles_service_select
on cb_target_graph.user_roles
for select
to cb_rls_service
using (true);

create view cb_target_graph.v_profiles_private
with (security_invoker = true, security_barrier = true)
as
select
  profile.user_id,
  profile.display_name,
  profile.account_privacy
from cb_target_graph.profiles as profile;

-- The invoker view relies on the caller's own-profile policy; its barrier is catalog-tested.
revoke all on schema cb_target_graph from public;
revoke all on cb_target_graph.profiles from public;
revoke all on cb_target_graph.user_roles from public;
revoke all on cb_target_graph.v_profiles_private from public;

grant usage on schema cb_target_graph
  to cb_rls_authenticated, cb_rls_service;
grant select on cb_target_graph.profiles
  to cb_rls_authenticated, cb_rls_service;
grant select on cb_target_graph.user_roles
  to cb_rls_service;
grant select on cb_target_graph.v_profiles_private
  to cb_rls_authenticated, cb_rls_service;
