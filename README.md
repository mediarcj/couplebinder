# Detechify

This app began as a tiny Node.js hello world with a `/health` check and grewincrementallyinto a security-first, stateless, Supabase-backed web app. Each step favored simplicity, correctness, and concurrency-safe patterns over cleverness.

Progress (high level)
v0  minimal server + /health + simple EJS
v1  security middleware (Helmet/CSP/CSRF), strict logging
v2  stateless auth (Supabase), canonical data model
v3  dashboard + profile-edit (CRUD), presenters, API hardening

## Canonical data flow

Client (signup / profile-edit)


Supabase Auth (auth.users)
 id, email, created_at, last_sign_in_at
 user_metadata: { phone, display_name,  }
   (trigger copies initial fields)

public.profiles (app-owned)   single write surface


public.v_profiles_full (read-only view for UI; owner/admin sees last_sign_in_at)


Server presenter (buildCanonicalUser)
 reads v_profiles_full (profile fields, roles, last_sign_in_at)
 overlays owner-only auth details when available (e.g., providers)


Front-end templates (dash/home/settings)
 render only canonicalUser (no client-side data mixing)

## Quick start

```bash
# Node.js 18+ recommended
git clone https://github.com/mediarcj/detechify.git
cd detechify

# Install and run (workspace script starts the server)
npm ci
npm run start

# App runs at http://localhost:3000
# Health check: http://localhost:3000/health

Useful endpoints (minimal)
		/  Home
		/health  Liveness/readiness surface
		/api/hello  Sanity check
		/api/profile/me  Authenticated profile (Bearer token or server auth cookie)

Project structure (essentials)

detechify/
 package.json
 package-lock.json
 server/
    zorvalon.js
    routes/
    middleware/
    services/
    ui_contract/
    ejs/
    public/
 docs/

Notes
		Stateless authentication via Supabase; server remains the authority for what the UI renders.
		Canonical reads come from v_profiles_full; writes go to public.profiles.
		Security posture includes CSP nonces, CSRF (cookie+header for cookie flows), and strict request logging.
		No Docker required.