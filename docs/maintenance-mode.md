# Maintenance Mode

Production-ready maintenance mode with instant toggle capability and comprehensive security.

## Overview

The maintenance mode system allows you to put the application into maintenance mode instantly without redeploying or restarting the server. It provides:

- **Instant toggle**: Redis-based control with environment fallback
- **Smart routing**: Health checks and ops IPs always pass through
- **Content negotiation**: JSON responses for APIs, HTML for browsers
- **Security**: Maintains all security headers and CSP policies
- **Monitoring**: Structured logging for all maintenance events

## Quick Start

### 1. Customize the maintenance page

Edit `server/public/maintenance.html` to match your brand. Keep it simple with no external assets.

### 2. Configure your toggle method

**Option A: Redis (Recommended - Instant toggle)**
```bash
# Set REDIS_URL in your environment
export REDIS_URL=redis://localhost:6379
```

**Option B: Environment fallback (Requires restart)**
```bash
# Set MAINTENANCE_DEFAULT=on in .env and restart
echo "MAINTENANCE_DEFAULT=on" >> .env
```

### 3. Toggle maintenance mode

```bash
# From repository root
npm run maint:on --workspace=server
npm run maint:off --workspace=server

# With automatic expiration (1 hour)
node server/scripts/maintenance-toggle.js on --ttl=3600
```

### 4. Configure ops access

```bash
# Allow specific IPs during maintenance
export MAINTENANCE_ALLOWLIST="203.0.113.10,127.0.0.1,::1"
```

### 5. Verify health checks work

```bash
# These always return 200, even during maintenance
curl https://your-domain.com/health/liveness
curl https://your-domain.com/health/readiness
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAINTENANCE_KEY` | `maintenance:mode` | Redis key for maintenance toggle |
| `MAINTENANCE_DEFAULT` | `off` | Fallback when Redis unavailable |
| `MAINTENANCE_ALLOWLIST` | `127.0.0.1,::1` | Comma-separated IP allowlist |
| `MAINTENANCE_RETRY_AFTER` | `120` | Retry-After header value (seconds) |
| `MAINTENANCE_PAGE` | `/app/public/maintenance.html` | Maintenance page file path |
| `MAINTENANCE_MESSAGE` | `We'll be back soon.` | Fallback message if page missing |

### Redis Configuration

The maintenance toggle requires Redis for instant control:

```bash
# Required for instant toggle
REDIS_URL=redis://localhost:6379

# Optional Redis configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-password
```

## Usage Examples

### Enable maintenance mode

```bash
# Basic toggle
npm run maint:on --workspace=server

# With 30-minute automatic expiration
node server/scripts/maintenance-toggle.js on --ttl=1800

# With 2-hour automatic expiration
node server/scripts/maintenance-toggle.js on --ttl=7200
```

### Disable maintenance mode

```bash
npm run maint:off --workspace=server
```

### Check maintenance status

```bash
# Check Redis key directly
redis-cli get maintenance:mode

# Or check via health endpoint (always works)
curl https://your-domain.com/health/liveness
```

## Security Features

### IP Allowlist

Trusted IPs can access the application during maintenance:

```bash
# Add your ops team IPs
export MAINTENANCE_ALLOWLIST="203.0.113.10,198.51.100.5,127.0.0.1,::1"
```

### Always-Allowed Paths

These paths always work, even during maintenance:

- `/health/liveness` - Health check endpoint
- `/health/readiness` - Readiness check endpoint  
- `/health` - General health endpoint
- `/.well-known/acme-challenge/*` - TLS certificate renewal

### Security Headers

Maintenance responses maintain security:

- **CSP**: Narrow policy for maintenance page only
- **Cache-Control**: `no-store, no-cache, must-revalidate`
- **Retry-After**: Standard HTTP header for client behavior

## Monitoring and Logging

### Structured Logs

All maintenance events are logged with structured data:

```json
{
  "event": "maintenance.block",
  "clientIp": "192.168.1.100",
  "path": "/dashboard",
  "method": "GET",
  "userAgent": "Mozilla/5.0...",
  "retryAfter": 120
}
```

### Events

- `maintenance.block` - Request blocked during maintenance
- `maintenance.allow_passthrough` - Allowlisted IP passed through
- `maintenance.guard_error` - Maintenance guard encountered error
- `maintenance.page_load_failed` - Failed to load maintenance page file

## Integration with Cloudflare (Optional)

For additional edge-level protection, you can configure Cloudflare rules:

### Cloudflare Workers Script

```javascript
// Optional: Cloudflare Worker for edge maintenance
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Allow health checks and ACME challenges
  if (url.pathname.startsWith('/health') || 
      url.pathname.startsWith('/.well-known/acme-challenge/')) {
    return fetch(request)
  }
  
  // Check Cloudflare KV for maintenance mode
  const maintenanceMode = await MAINTENANCE_KV.get('maintenance:mode')
  
  if (maintenanceMode === 'on') {
    return new Response(`
      <!DOCTYPE html>
      <html><body>
        <h1>Maintenance Mode</h1>
        <p>We'll be back soon.</p>
      </body></html>
    `, {
      status: 503,
      headers: {
        'Retry-After': '120',
        'Content-Type': 'text/html'
      }
    })
  }
  
  return fetch(request)
}
```

### Cloudflare Page Rules

Create a page rule for maintenance mode:

1. **URL Pattern**: `*your-domain.com/*`
2. **Settings**:
   - Browser Cache TTL: `Respect Existing Headers`
   - Cache Level: `Cache Everything`
   - Edge Cache TTL: `1 month`

## Troubleshooting

### Redis Connection Issues

If Redis is unavailable, the CLI will guide you:

```bash
$ npm run maint:on --workspace=server
Error: REDIS_URL environment variable is not set

To use Redis-based maintenance toggle:
1. Set REDIS_URL in your .env file or environment
2. Example: REDIS_URL=redis://localhost:6379

Alternative: Use environment fallback:
1. Set MAINTENANCE_DEFAULT=on in .env
2. Restart the application server
```

### Maintenance Page Not Loading

The system gracefully falls back to a minimal HTML page if the maintenance page file is missing or unreadable.

### IP Allowlist Not Working

Check that your IP is correctly formatted and that you're using the `CF-Connecting-IP` header (if behind Cloudflare) or the correct `req.ip` value.

## Testing

Run the maintenance mode tests:

```bash
npm run test --workspace=server -- maintenanceGuard
```

The tests cover:
- Basic on/off functionality
- Allowed paths (health checks, ACME)
- IP allowlist behavior
- Content negotiation (JSON vs HTML)
- Error handling and fail-open behavior
- Logging and monitoring

## Architecture

### Middleware Order

The maintenance guard is positioned in the middleware stack:

1. Trust proxy and IP extraction
2. Request ID tracking
3. Security headers and CSP
4. IP firewall
5. **Maintenance guard** ← Here
6. Authentication and sessions
7. Application routes
8. Error handling

### Redis Key Structure

```
maintenance:mode → "on" | "off"
```

### Response Flow

```
Request → Maintenance Guard → Check Mode → Response
    ↓
Health Check? → Yes → Allow
    ↓
Allowlisted IP? → Yes → Allow  
    ↓
Maintenance ON? → Yes → 503 Response
    ↓
No → Continue to App
```

This architecture ensures that maintenance mode integrates seamlessly with the existing security stack while providing instant toggle capability for production operations.
