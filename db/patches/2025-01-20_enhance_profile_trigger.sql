-- db/patches/2025-01-20_enhance_profile_trigger.sql
-- Purpose: Update profile creation trigger to extract profile data from user_metadata
-- Safe to re-run. Enhances existing trigger with profile data extraction.

-- Enhanced trigger function to extract profile data from user_metadata
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (
    user_id, 
    email,
    given_name,
    family_name,
    display_name_override,
    phone
  )
  values (
    new.id, 
    new.email,
    new.raw_user_meta_data->>'given_name',
    new.raw_user_meta_data->>'family_name',
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'phone'
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

-- Trigger already exists, this just updates the function
-- drop trigger if exists on_auth_user_created on auth.users;
-- create trigger on_auth_user_created after insert on auth.users
-- for each row execute function public.handle_new_user();
