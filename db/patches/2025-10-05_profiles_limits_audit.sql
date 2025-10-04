-- db/patches/2025-10-05_profiles_limits_audit.sql
-- Purpose: enforce server-advertised field limits, add audit trail, and polish RLS posture
-- Safe to re-run. Uses conditional DO blocks for constraints.

begin;

-- ---------- LENGTH / FORMAT CONSTRAINTS (match your UI instructions) ----------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_display_name_override_len') then
    alter table public.profiles
      add constraint profiles_display_name_override_len
      check (display_name_override is null or length(display_name_override) <= 100);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_phone_len') then
    alter table public.profiles
      add constraint profiles_phone_len
      check (phone is null or length(phone) <= 32);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_profile_title_len') then
    alter table public.profiles
      add constraint profiles_profile_title_len
      check (profile_title is null or length(profile_title) <= 140);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_profile_description_len') then
    alter table public.profiles
      add constraint profiles_profile_description_len
      check (profile_description is null or length(profile_description) <= 2000);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_social_1_len') then
    alter table public.profiles
      add constraint profiles_social_1_len
      check (social_media1 is null or length(social_media1) <= 140);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_social_2_len') then
    alter table public.profiles
      add constraint profiles_social_2_len
      check (social_media2 is null or length(social_media2) <= 140);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_social_3_len') then
    alter table public.profiles
      add constraint profiles_social_3_len
      check (social_media3 is null or length(social_media3) <= 140);
  end if;
end $$;

-- ---------- ACCOUNT PRIVACY ENUM-CHECK ----------
do $$
begin
  -- add the column if it somehow doesn't exist yet
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='account_privacy'
  ) then
    alter table public.profiles add column account_privacy text;
  end if;

  -- enforce allowed values
  if not exists (select 1 from pg_constraint where conname = 'profiles_account_privacy_check') then
    alter table public.profiles
      add constraint profiles_account_privacy_check
      check (account_privacy is null or account_privacy in ('public','private'));
  end if;
end $$;

-- ---------- OPTIONAL: SIMPLE EMAIL NORMALIZATION GUARD ----------
-- Keep emails in lowercase; helps avoid collisions later.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_email_lower') then
    alter table public.profiles
      add constraint profiles_email_lower
      check (email = lower(email));
  end if;
end $$;

-- ---------- AUDIT TRAIL ----------
create table if not exists public.audit_profiles (
  at timestamptz not null default now(),
  verb text not null,              -- 'INSERT' | 'UPDATE' | 'DELETE'
  user_id uuid,                    -- affected profile user_id
  actor uuid,                      -- auth.uid() when available (nullable if run by service role)
  snapshot jsonb not null
);

-- limit who can see audit rows (no grants to anon/auth)
alter table public.audit_profiles enable row level security;

drop policy if exists audit_profiles_admin_read on public.audit_profiles;
create policy audit_profiles_admin_read on public.audit_profiles
  for select using (
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role in ('admin','super_user')
    )
  );

create or replace function public.audit_profiles_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_profiles(verb, user_id, actor, snapshot)
    values ('INSERT', new.user_id, auth.uid(), to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_profiles(verb, user_id, actor, snapshot)
    values ('UPDATE', new.user_id, auth.uid(), to_jsonb(new));
    return new;
  else
    -- DELETE
    insert into public.audit_profiles(verb, user_id, actor, snapshot)
    values ('DELETE', old.user_id, auth.uid(), to_jsonb(old));
    return old;
  end if;
end $$;

drop trigger if exists trg_profiles_audit on public.profiles;
create trigger trg_profiles_audit
after insert or update or delete on public.profiles
for each row execute function public.audit_profiles_change();

-- ---------- FINAL RLS POLISH (idempotent) ----------
-- Ensure user_roles RLS is ON and readable by owners; admins override already set earlier in your setup.
alter table public.user_roles enable row level security;

drop policy if exists user_roles_read_own on public.user_roles;
create policy user_roles_read_own on public.user_roles
  for select using (auth.uid() = user_id);

-- (Optional) If you want roles catalog itself to be admin-only:
-- revoke all on table public.roles from anon, authenticated;
-- RLS on roles is usually unnecessary if it's a tiny static catalog.

commit;