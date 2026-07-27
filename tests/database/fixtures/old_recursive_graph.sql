-- Purpose: Model the defective repository policy graph with synthetic rows.
-- Graph: Old recursive user_roles authorization path.
-- Scope: TEST-ONLY SYNTHETIC AUTHORIZATION GRAPH. NOT A MIGRATION.
-- Security assertion: A non-owner authenticated view query must raise exact 42P17.
-- DO NOT APPLY TO STAGING OR PRODUCTION.

create schema cb_old_graph;

create function cb_old_graph.auth_uid()
returns integer
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::integer
$function$;

create table cb_old_graph.profiles (
  user_id integer primary key,
  display_name text not null
);

create table cb_old_graph.user_roles (
  user_id integer not null,
  role text not null,
  primary key (user_id, role)
);

insert into cb_old_graph.profiles (user_id, display_name)
values (1, 'Synthetic One'), (2, 'Synthetic Two');

insert into cb_old_graph.user_roles (user_id, role)
values (1, 'member'), (2, 'admin');

alter table cb_old_graph.profiles enable row level security;
alter table cb_old_graph.user_roles enable row level security;

create policy profiles_select_own
on cb_old_graph.profiles
for select
to cb_rls_authenticated
using (cb_old_graph.auth_uid() = user_id);

create policy profiles_admin_read
on cb_old_graph.profiles
for select
to public
using (
  exists (
    select 1
    from cb_old_graph.user_roles as checked_roles
    where checked_roles.user_id = cb_old_graph.auth_uid()
      and checked_roles.role in ('admin', 'super_user')
  )
);

create policy user_roles_read_own
on cb_old_graph.user_roles
for select
to cb_rls_authenticated
using (cb_old_graph.auth_uid() = user_id);

create policy user_roles_admin_all
on cb_old_graph.user_roles
to public
using (
  exists (
    select 1
    from cb_old_graph.user_roles as checked_roles
    where checked_roles.user_id = cb_old_graph.auth_uid()
      and checked_roles.role in ('admin', 'super_user')
  )
)
with check (
  exists (
    select 1
    from cb_old_graph.user_roles as checked_roles
    where checked_roles.user_id = cb_old_graph.auth_uid()
      and checked_roles.role in ('admin', 'super_user')
  )
);

create view cb_old_graph.v_profiles_full
with (security_invoker = true)
as
select
  profile.user_id,
  profile.display_name,
  assigned_role.role
from cb_old_graph.profiles as profile
left join cb_old_graph.user_roles as assigned_role
  on assigned_role.user_id = profile.user_id;

-- Invoker rights force the synthetic authenticated caller through underlying RLS.
grant usage on schema cb_old_graph
  to cb_rls_authenticated, cb_rls_service;
grant select on cb_old_graph.profiles, cb_old_graph.user_roles
  to cb_rls_authenticated, cb_rls_service;
grant select on cb_old_graph.v_profiles_full
  to cb_rls_authenticated, cb_rls_service;
