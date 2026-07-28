-- Purpose: Model the supported old repository profile/RLS starting state.
-- Scope: Synthetic test-only fixture; not a production migration.
-- Starting state: Default security-definer view plus recursive policies and Auth helper.
-- Security assertion: The forward migration must recognize and repair this exact defective graph.

\set ON_ERROR_STOP on
\ir phase2_base.sql

create view public.v_profiles_full
as
select
  profile.user_id,
  profile.display_name,
  profile.email,
  profile.phone,
  profile.given_name,
  profile.family_name,
  profile.avatar_url,
  profile.birthday,
  profile.gender,
  profile.language,
  profile.city_province,
  profile.country,
  profile.social_media1,
  profile.social_media2,
  profile.social_media3,
  profile.relationship_status,
  profile.job,
  profile.hobbies,
  profile.music,
  profile.fav_food,
  profile.profile_title,
  profile.profile_description,
  profile.account_privacy,
  profile.locale,
  profile.timezone,
  profile.created_at,
  profile.updated_at,
  sign_in.last_sign_in_at,
  coalesce(
    array_agg(assigned_role.role) filter (where assigned_role.role is not null),
    '{}'::text[]
  ) as roles
from public.profiles as profile
left join public.user_roles as assigned_role
  on assigned_role.user_id = profile.user_id
left join public._auth_last_signins() as sign_in
  on sign_in.user_id = profile.user_id
group by
  profile.user_id,
  profile.display_name,
  profile.email,
  profile.phone,
  profile.given_name,
  profile.family_name,
  profile.avatar_url,
  profile.birthday,
  profile.gender,
  profile.language,
  profile.city_province,
  profile.country,
  profile.social_media1,
  profile.social_media2,
  profile.social_media3,
  profile.relationship_status,
  profile.job,
  profile.hobbies,
  profile.music,
  profile.fav_food,
  profile.profile_title,
  profile.profile_description,
  profile.account_privacy,
  profile.locale,
  profile.timezone,
  profile.created_at,
  profile.updated_at,
  sign_in.last_sign_in_at;

grant select on public.v_profiles_full to anon, authenticated, service_role;
