-- Purpose: Model the supplied deployed hybrid graph with synthetic rows.
-- Graph: Security-invoker view, recursive roles, public policy, and old helper.
-- Scope: TEST-ONLY SYNTHETIC AUTHORIZATION GRAPH. NOT A MIGRATION.
-- Security assertion: The view must raise exact 42P17 while the helper succeeds alone.
-- DO NOT APPLY TO STAGING OR PRODUCTION.

create schema cb_hybrid_auth;
create schema cb_hybrid_graph;

create table cb_hybrid_auth.synthetic_auth_users (
  user_id integer primary key,
  last_sign_in_at timestamptz
);

insert into cb_hybrid_auth.synthetic_auth_users (user_id, last_sign_in_at)
values (1, null), (2, null);

create function cb_hybrid_graph.auth_uid()
returns integer
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::integer
$function$;

create function cb_hybrid_graph._auth_last_signins()
returns table (
  user_id integer,
  last_sign_in_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, cb_hybrid_auth
as $function$
  select source.user_id, source.last_sign_in_at
  from cb_hybrid_auth.synthetic_auth_users as source
$function$;

-- Broad helper execution is modeled as a separate historical exposure.
grant execute on function cb_hybrid_graph._auth_last_signins() to public;

create table cb_hybrid_graph.profiles (
  user_id integer primary key,
  display_name text not null,
  account_privacy text not null
    check (account_privacy in ('public', 'private'))
);

create table cb_hybrid_graph.user_roles (
  user_id integer not null,
  role text not null,
  primary key (user_id, role)
);

insert into cb_hybrid_graph.profiles (
  user_id,
  display_name,
  account_privacy
)
values
  (1, 'Synthetic One', 'private'),
  (2, 'Synthetic Two', 'public');

insert into cb_hybrid_graph.user_roles (user_id, role)
values (1, 'member'), (2, 'admin');

alter table cb_hybrid_graph.profiles enable row level security;
alter table cb_hybrid_graph.user_roles enable row level security;

create policy profiles_select_own
on cb_hybrid_graph.profiles
for select
to cb_rls_authenticated
using (cb_hybrid_graph.auth_uid() = user_id);

create policy profiles_public_read
on cb_hybrid_graph.profiles
for select
to public
using (account_privacy = 'public');

create policy profiles_admin_read
on cb_hybrid_graph.profiles
for select
to public
using (
  exists (
    select 1
    from cb_hybrid_graph.user_roles as checked_roles
    where checked_roles.user_id = cb_hybrid_graph.auth_uid()
      and checked_roles.role in ('admin', 'super_user')
  )
);

create policy user_roles_read_own
on cb_hybrid_graph.user_roles
for select
to cb_rls_authenticated
using (cb_hybrid_graph.auth_uid() = user_id);

create policy user_roles_admin_all
on cb_hybrid_graph.user_roles
to public
using (
  exists (
    select 1
    from cb_hybrid_graph.user_roles as checked_roles
    where checked_roles.user_id = cb_hybrid_graph.auth_uid()
      and checked_roles.role in ('admin', 'super_user')
  )
)
with check (
  exists (
    select 1
    from cb_hybrid_graph.user_roles as checked_roles
    where checked_roles.user_id = cb_hybrid_graph.auth_uid()
      and checked_roles.role in ('admin', 'super_user')
  )
);

create view cb_hybrid_graph.v_profiles_full
with (security_invoker = true)
as
select
  profile.user_id,
  profile.display_name,
  profile.account_privacy,
  assigned_role.role,
  sign_in.last_sign_in_at
from cb_hybrid_graph.profiles as profile
left join cb_hybrid_graph.user_roles as assigned_role
  on assigned_role.user_id = profile.user_id
left join cb_hybrid_graph._auth_last_signins() as sign_in
  on sign_in.user_id = profile.user_id;

-- These synthetic grants are deliberately broad enough to reach caller RLS.
grant usage on schema cb_hybrid_graph
  to cb_rls_anon, cb_rls_authenticated, cb_rls_service;
grant select on cb_hybrid_graph.profiles, cb_hybrid_graph.user_roles
  to cb_rls_anon, cb_rls_authenticated, cb_rls_service;
grant select on cb_hybrid_graph.v_profiles_full
  to cb_rls_anon, cb_rls_authenticated, cb_rls_service;
