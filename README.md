# Couplebinder

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

## Stripe Billing (Dev vs Prod)

### Webhook Configuration

**Webhook Path:** `/api/stripe/webhook` (bypasses auth, signature-verified)

**Local Development:**
- Use Stripe CLI forwarding: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- Test events are logged to console with request IDs

**Production:**
- Configure in Stripe Dashboard → Webhooks → Add endpoint
- URL: `https://yourdomain.com/api/stripe/webhook`
- Required events: `checkout.session.completed`, `charge.refunded`

### Go-Live Checklist

1. **Swap to live keys:**
   - Update `STRIPE_SECRET_KEY` to `sk_live_...`
   - Update `STRIPE_WEBHOOK_SECRET` to live webhook secret
   - Update `STRIPE_PRICE_RESUME_ONE_TIME` to live price ID
   - Update `STRIPE_PRICE_RESUME_EXPERT` to live price ID

2. **Verify webhook endpoint:**
   - Test webhook receipt in Stripe Dashboard → Webhooks
   - Check logs for successful `checkout.session.completed` events

3. **Run database migrations:**
   ```bash
   # Apply Stripe tables and indexes
   psql -d your_database -f db/migrations/20251022_stripe_billing_tables.sql
   psql -d your_database -f db/migrations/20251025_stripe_customer_env_split.sql
   psql -d your_database -f db/manual/stripe_indexes_and_policies.sql
   ```

4. **Test full payment flow:**
   - Complete test purchase with live card
   - Verify payment record created in database
   - Confirm webhook received and processed

## Maintenance Mode (simple & secure)

What it does: Puts the site in maintenance. Everyone (except your allowlisted ops IPs and health checks) sees a friendly page with 503 Service Unavailable and Retry-After, so clients know to try again later.

Quick start
	1.	Customize the page
Edit public/maintenance.html (keep it simple; no external assets).
	2.	Pick your toggle style
	•	Instant (recommended): set REDIS_URL and use the CLI (no restart).
	•	Env fallback: set MAINTENANCE_DEFAULT=on in .env and restart.
	3.	Toggle with CLI (from repo root):
npm run maint:on --workspace=server
npm run maint:off --workspace=server
npm run maint:on --workspace=server -- --ttl=3600

If Redis isn't configured, the CLI will tell you to use the env fallback.

	4.	Allowlist ops
MAINTENANCE_ALLOWLIST=203.0.113.10,127.0.0.1 to let trusted IPs through.
	5.	Health checks still pass
/health/liveness and /health/readiness always return 200.

Defaults
MAINTENANCE_DEFAULT=off
MAINTENANCE_ALLOWLIST=127.0.0.1,::1
MAINTENANCE_RETRY_AFTER=120
MAINTENANCE_PAGE=/app/public/maintenance.html
MAINTENANCE_MESSAGE=We'll be back soon.
MAINTENANCE_KEY=maintenance:mode
REDIS_URL=redis://redis:6379

Why this approach?
	•	Secure: No new admin endpoints to protect.
	•	Fast: Redis toggle is instant; env fallback is simple.
	•	Standard: Proper 503 + Retry-After.
	•	Customizable: Brand the page; optional Cloudflare edge layer later.

## Security Notes

**Default-Deny Authentication**: All `/api` and `/dashboard` routes require authentication by default. If you add a new public API endpoint under `/api`, remember to add it to the public allowlist in `server/zorvalon.js`.

**Health Endpoints**: Public `/health` and `/health/liveness` return minimal responses. Detailed health information requires ops token or IP allowlist. See `docs/security.md` for details.

## API Documentation

**Profile API**: Complete documentation for profile management endpoints, including privacy field handling, validation rules, and precedence behavior. See `docs/profile-api.md` for detailed API contracts and usage examples.