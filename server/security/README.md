# Product role authority

CoupleBinder product authorization comes from one request-local result produced
by `roleAuthority.js` after JWT cryptographic and claim verification succeeds.

The canonical signed input is `app_metadata.roles`. Supported product values
are `admin` and `user`. Unknown or malformed values are ignored. Profile rows,
`user_roles`, `user_metadata`, request bodies, query strings, and browser
flags never grant product authority.

## Compatibility switches

All compatibility switches default to false:

- `AUTH_ROLE_LEGACY_APP_METADATA_ROLE`
- `AUTH_ROLE_LEGACY_TOP_LEVEL_USER_ROLE`
- `AUTH_ROLE_SUPER_USER_AS_ADMIN`

The first two switches accept their exact legacy signed shape only when the
canonical `app_metadata.roles` claim is absent. A present empty or malformed
canonical claim never falls through to a legacy shape.

The third switch maps verified `super_user` to ordinary `admin` authority. It
does not create a higher role and never exposes `super_user` as a public role.

## Retirement contract

Do not enable a compatibility switch without owner approval and staging
evidence that trusted Supabase or server tooling still issues that exact
shape. Record the issuer, affected environment, enablement date, and removal
owner without recording tokens or claim values.

Remove each switch after the issuing system uses `app_metadata.roles`, old
refresh sessions are revoked, and staging has remained free of compatibility
usage for at least the configured maximum access-token lifetime. If staging
finds no trusted use, leave the switch disabled and remove the compatibility
path in a separately reviewed change.

Role results are never cached outside the current request. Provider session
revocation timing, access-token lifetime, and emergency administrator
disablement remain operational controls that require staging verification.
