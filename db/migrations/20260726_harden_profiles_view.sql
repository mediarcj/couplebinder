begin;

drop view if exists public.v_profiles_full;

drop function if exists public._auth_last_signins();

-- The former "public" row policy exposed every column in public.profiles,
-- including contact and demographic fields, whenever account_privacy was public.
-- Public profile discovery needs a separate, deliberately column-limited view;
-- this private account view is own-row/admin only.
drop policy if exists profiles_public_read on public.profiles;

create view public.v_profiles_full
with (security_invoker = true, security_barrier = true)
as
select
  p.user_id,
  coalesce(
    nullif(trim(p.display_name_override), ''),
    nullif(trim(concat_ws(' ', nullif(trim(p.given_name), ''), nullif(trim(p.family_name), ''))), ''),
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
  null::timestamptz as last_sign_in_at,
  coalesce(array_agg(ur.role) filter (where ur.role is not null), '{}'::text[]) as roles
from public.profiles p
left join public.user_roles ur on ur.user_id = p.user_id
group by
  p.user_id,
  p.email,
  p.phone,
  p.given_name,
  p.family_name,
  p.display_name_override,
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
  p.account_privacy,
  p.locale,
  p.timezone,
  p.created_at,
  p.updated_at;

revoke all on public.v_profiles_full from public;
revoke all on public.v_profiles_full from anon;
grant select on public.v_profiles_full to authenticated;

commit;
