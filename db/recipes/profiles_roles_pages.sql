-- db/recipes/profiles_roles_pages.sql
-- Creates profiles, roles, user_roles, pages, page_access_rules, v_profiles_full and RLS.

-- PROFILES (editable table)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  given_name text,
  family_name text,
  display_name_override text,
  phone text,
  birthday date,
  gender text,
  language text,
  city_province text,
  country text,
  social_media1 text,
  social_media2 text,
  social_media3 text,
  relationship_status text,
  job text,
  hobbies text,
  music text,
  fav_food text,
  profile_title text,
  profile_description text,
  account_privacy text check (account_privacy in ('public','private')) default 'public',
  avatar_url text,
  locale text,
  timezone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_profiles_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch
before update on public.profiles
for each row execute function public.touch_profiles_updated_at();

-- VIEW (read-only): includes a canonical display_name and roles[]
create or replace view public.v_profiles_full as
select
  p.user_id,
  p.email,
  p.given_name,
  p.family_name,
  p.display_name_override,
  coalesce(nullif(trim(p.display_name_override), ''),
           nullif(trim(concat_ws(' ', trim(p.given_name), trim(p.family_name))), ''),
           split_part(p.email, '@', 1)) as display_name,
  p.phone,
  p.birthday,
  p.gender,
  p.language,
  p.city_province,
  p.country,
  p.social_media1,
  p.social_media2,
  p.social_media3,
  p.relationship_status,
  p.job,
  p.hobbies,
  p.music,
  p.fav_food,
  p.profile_title,
  p.profile_description,
  p.account_privacy,
  p.avatar_url,
  p.locale,
  p.timezone,
  p.created_at,
  p.updated_at,
  coalesce(array_agg(ur.role) filter (where ur.role is not null), '{}') as roles
from public.profiles p
left join public.user_roles ur on ur.user_id = p.user_id
group by p.user_id, p.email, p.given_name, p.family_name, p.display_name_override, p.phone,
         p.birthday, p.gender, p.language, p.city_province, p.country, p.social_media1,
         p.social_media2, p.social_media3, p.relationship_status, p.job, p.hobbies, p.music,
         p.fav_food, p.profile_title, p.profile_description, p.account_privacy, p.avatar_url,
         p.locale, p.timezone, p.created_at, p.updated_at;

-- RLS
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (auth.uid() = user_id);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert with check (auth.uid() = user_id);

-- ROLES
create table if not exists public.roles ( role text primary key );
insert into public.roles(role) values ('admin'), ('super_user'), ('user') on conflict do nothing;

create table if not exists public.user_roles (
  user_id uuid references auth.users(id) on delete cascade,
  role text references public.roles(role) on delete cascade,
  primary key (user_id, role)
);

alter table public.user_roles enable row level security;

drop policy if exists user_roles_read_own on public.user_roles;
create policy user_roles_read_own on public.user_roles for select using (auth.uid() = user_id);

-- Admin override on profiles
drop policy if exists profiles_admin_read on public.profiles;
create policy profiles_admin_read on public.profiles
  for select using (
    exists (select 1 from public.user_roles ur
            where ur.user_id = auth.uid() and ur.role in ('admin','super_user'))
  );

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update using (
    exists (select 1 from public.user_roles ur
            where ur.user_id = auth.uid() and ur.role in ('admin','super_user'))
  );

-- Trigger: bootstrap profiles row on new auth user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- PAGES & ACCESS (optional)
create table if not exists public.pages (
  path text primary key,
  is_public boolean not null default false,
  description text
);

create table if not exists public.page_access_rules (
  path text references public.pages(path) on delete cascade,
  role text references public.roles(role) on delete cascade,
  primary key (path, role)
);

-- Seed sample pages
insert into public.pages(path, is_public, description) values
  ('/','true','Home'),
  ('/dashboard','false','User dashboard'),
  ('/admin','false','Admin area')
on conflict do nothing;

insert into public.page_access_rules(path, role) values
  ('/dashboard','user'),
  ('/admin','admin')
on conflict do nothing;
