# Technology Stack Overview

This document captures every major platform, service, framework, and tool that powers Detechify. Each entry explains **what** the technology is, **where** it lives in the repo, and **how** it is implemented inside the app.

---

## Runtime & Core Frameworks

| Technology | How it is used |
| --- | --- |
| **Node.js 18+** | Primary runtime for the server (`package.json` & `server/package.json`). All scripts (`npm run start`, maintenance toggles, Stripe CLI helpers) assume Node 18 LTS. |
| **npm Workspaces** | Root workspace hosts the server package, enabling shared scripts (`npm run start --workspace=server`). |
| **Express 4** | HTTP server defined in `server/zorvalon.js` with modular bootstrap layers for middleware, routes, errors, and shutdown handling. |
| **EJS Templates** | Server-rendered UI lives under `server/ejs/*.ejs`. Templates consume presenters and include CSP nonces, CSRF meta tags, and hydration hints. |
| **Nginx** | Reverse-proxy configuration provided in `nginx/templates/*.conf` to terminate TLS, honor Cloudflare headers, and forward health checks when deployed behind EC2/Cloudflare. |

---

## Infrastructure & Hosting

| Technology | How it is used |
| --- | --- |
| **AWS EC2** | Primary production target (see `docs/executive.md` & `docs/https-redirect-fix.md`). Deployment guidance includes pulling latest code, managing systemd services, and storing secrets in `/var/lib/detechify/.env.server`. |
| **Cloudflare Edge** | Front-line DDoS + WAF protection. Middleware such as `enforceHttps`, `trustProxyIp`, and rate limiting (`server/middleware/rateLimiter.js`) treat Cloudflare as the primary layer while the app enforces a secondary Redis-backed layer. |
| **Cloudflare Turnstile** | Bot mitigation helper (`server/lib/turnstile.js`) verifies tokens for interactive login/register flows when enabled via config. |
| **Docker & Docker Compose** | Optional local/ops tooling (`docker-compose*.yml`, `README.Docker.md`). Used for reproducing the stack with Nginx + server containers or running maintenance proof environments. |
| **Redis** | Shared state for rate limiting, maintenance toggle, IP firewall, and logout watermarks (`server/utils/redisClient.js`, `server/bootstrap/coreMiddleware.js`). Health endpoints expose Redis status for monitoring. |

---

## Authentication, Data & Storage

| Technology | How it is used |
| --- | --- |
| **Supabase Auth & Postgres** | Central identity + data layer. The server uses `@supabase/supabase-js` to interact with auth, `public.profiles`, and `v_profiles_full` views (see README canonical data flow). Presenters (`server/ui_contract`) build canonical users from Supabase responses. |
| **JOSE** | The `jose` library verifies Supabase JWTs inside `server/middleware/authBridge.js`, supporting RS/ES algorithms and JWKS rotation. |
| **Sanitize-HTML** | Input hygiene for profile fields and submissions enforced inside `server/middleware/security.js`. |
| **rate-limiter-flexible** | Redis-backed limiters (`server/middleware/rateLimiter.js`) provide per-route application limits in addition to Cloudflare edge rules. |
| **Cloudflare Turnstile** | (Also listed above) protects auth & registration endpoints when enabled. |

---

## Payments & Monetization

| Technology | How it is used |
| --- | --- |
| **Stripe** | Billing flows implemented across `server/services/pricingCatalog.js`, `server/services/billingService.js`, and `server/routes/dashboard.js`. Webhooks land at `/api/stripe/webhook` with signature verification; Stripe success/cancel paths are controlled via `config.stripe.*`. The purchase confirmation template (`server/ejs/purchase-confirmation.ejs`) hydrates receipt data from Stripe. |
| **Stripe CLI** | Recommended in the README for local webhook forwarding (`stripe listen --forward-to localhost:3000/api/stripe/webhook`). |

---

## Security & Compliance

| Technology | How it is used |
| --- | --- |
| **Helmet** | Base security headers (CSP, HSTS, frameguard) set inside `server/bootstrap/coreMiddleware.js`. |
| **CSRF Double-Submit Tokens** | Cookie + header enforcement implemented via `server/middleware/csrfLite.js`, used across forms and API routes. |
| **Custom Structured Logger** | `server/utils/logger.js` supplies JSON logging with PII redaction. All runtime modules (`routes`, `services`, `middleware`) consume it. |
| **Cloudflare + Redis Rate Limiting** | Defense-in-depth: Cloudflare handles volumetric load, while Redis + rate-limiter-flexible protect app-specific actions (login, profile edit, Stripe endpoints). |
| **Maintenance Guard** | `server/middleware/maintenanceGuard.js` and CLI (`server/scripts/maintenance-toggle.js`) read/write Redis toggles and optionally integrate with Cloudflare rules (see `docs/maintenance-mode.md`). |
| **HTTPS Enforcement** | `server/middleware/enforceHttps.js` honors `CF-Visitor` and `X-Forwarded-Proto` headers to redirect to canonical HTTPS origins even behind Cloudflare+ALB. |

---

## Developer Tooling & Testing

| Technology | How it is used |
| --- | --- |
| **Vitest** | Primary test runner (`server/package.json` scripts `test`, `test:watch`, `test:ci`). Tests reside in `server/__tests__`. |
| **Supertest** | HTTP assertion utility for integration tests (e.g., `server/__tests__/authFlows.test.js`). |
| **ESLint** | Repo-wide linting (root `.eslintrc.json` and `server/.eslintrc.cjs`) with overrides to enforce no-console, restricted imports, and custom auth guard rules. |
| **Maintenance CLI** | Scripts under `server/scripts/maintenance-toggle.js` allow operators to enable/disable maintenance mode without redeploying. |
| **NPM Scripts** | Commands in both root and server `package.json` files manage dev server, linting, Docker lifecycle, and Stripe/Supabase tooling. |

---

## Observability & Ops

| Technology | How it is used |
| --- | --- |
| **Structured Request Logging** | `server/middleware/requestId.js` + `logger.js` emit correlation IDs for every request, enabling Cloudflare/AWS log stitching. |
| **Health Endpoints** | `/health`, `/health/liveness`, `/health/readiness` (see `server/routes/health.js`) surface Redis status, maintenance state, and build metadata for AWS/Cloudflare monitors. |
| **AWS CloudWatch / Metric Filters** | Guidance in `docs/executive.md` and `docs/https-redirect-fix.md` explains how logs integrate with AWS CloudWatch filters for ops dashboards. |

---

## Summary

Detechify combines a classic Node.js/Express + EJS stack with Supabase-backed data, Stripe billing, Redis coordination, and Cloudflare/AWS infrastructure hardening. Security middleware (Helmet, CSP, CSRF), structured logging, and Redis-aware maintenance/rate limiting ensure the app remains production-ready while staying small and auditable. Docker/Nginx assets support containerized deployments, and Vitest/Supertest keep the server testable. This document will stay updated as new technologies land in the repo.


