# Profiles & Roles Integration

This project was patched to use a canonical profile model:

- `auth.users` remains the source of identity (id, email, providers).
- `public.profiles` holds editable app fields (given_name, family_name, display_name_override, phone, etc.).
- `public.v_profiles_full` is a read-only view that computes `display_name` and aggregates `roles` for display.
- `roles`/`user_roles` manage admin overrides and page access.

## Apply schema to Supabase

```bash
export DB_URL='postgresql://<user>:<pass>@<host>:5432/postgres?sslmode=require'
psql "$DB_URL" -v ON_ERROR_STOP=1 -f db/recipes/profiles_roles_pages.sql
```

## Presenters

`server/ui_contract/presenters.js` now builds a canonical user via the DB view first,
and falls back to JWT metadata. Your UI should read `user.display_name` everywhere.

## Service

`server/services/profileService.js` provides a `getProfileByUserId(userId)` that reads from `v_profiles_full`.
