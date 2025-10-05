-- Expose last_sign_in_at safely via definer function + refresh v_profiles_full
create or replace function public._auth_last_signins()
returns table (user_id uuid, last_sign_in_at timestamptz)
language sql
security definer
set search_path = public, auth
as $$
  select u.id::uuid, u.last_sign_in_at
  from auth.users u
$$;

revoke all on function public._auth_last_signins() from public;
grant execute on function public._auth_last_signins() to anon, authenticated;

begin;

drop view if exists public.v_profiles_full;

create view public.v_profiles_full as
select
  p.user_id,
  coalesce(
    nullif(trim(p.display_name_override), ''),
    nullif(trim(concat_ws(' ', nullif(trim(p.given_name),''), nullif(trim(p.family_name),''))), ''),
    split_part(p.email, '@', 1)
  ) as display_name,
  p.email,
  p.phone,
  p.given_name,
  p.family_name,
  p.avatar_url,
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
  coalesce(p.account_privacy, 'public') as account_privacy,
  p.locale,
  p.timezone,
  p.created_at,
  p.updated_at,
  case
    when auth.uid() = p.user_id
      or exists (
        select 1 from public.user_roles ur
        where ur.user_id = auth.uid()
          and ur.role in ('admin','super_user')
      )
      or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    then als.last_sign_in_at
    else null
  end as last_sign_in_at,
  coalesce(array_agg(ur.role) filter (where ur.role is not null), '{}'::text[]) as roles
from public.profiles p
left join public.user_roles ur on ur.user_id = p.user_id
left join public._auth_last_signins() als on als.user_id = p.user_id
group by
  p.user_id, p.email, p.phone, p.given_name, p.family_name, p.display_name_override,
  p.avatar_url, p.birthday, p.gender, p.language, p.city_province, p.country,
  p.social_media1, p.social_media2, p.social_media3, p.relationship_status, p.job,
  p.hobbies, p.music, p.fav_food, p.profile_title, p.profile_description,
  p.account_privacy, p.locale, p.timezone, p.created_at, p.updated_at, als.last_sign_in_at;

grant select on public.v_profiles_full to anon, authenticated;

commit;