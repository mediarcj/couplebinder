# Security Documentation

## Default-Deny Authentication Policy

### Overview

Detechify implements a **default-deny authentication policy** for sensitive path prefixes to prevent accidental anonymous access. This ensures that protected areas require explicit authentication by default, with only a small, explicit allowlist of public paths.

### Protected Prefixes

The following path prefixes are protected by default-deny authentication:

- `/api/*` - All API endpoints (except explicitly allowlisted)
- `/dashboard/*` - All dashboard pages

### Public Path Allowlist

The following paths remain publicly accessible without authentication:

- `/` - Home page
- `/login` - Login page
- `/css/**` - Static CSS files
- `/js/**` - Static JavaScript files  
- `/images/**` - Static image files
- `/favicon.ico` - Favicon
- Public health links removed from templates (endpoints now gated)
- `/api/auth/set-cookie` - Cookie setting endpoint
- `/api/auth/clear-cookie` - Cookie clearing endpoint

### Adding New Public APIs

**Important**: If you add a new public API endpoint under `/api`, you must add it to the public allowlist in `server/zorvalon.js`.

Example:
```javascript
const publicGlobs = [
  '/', '/login',
  '/css/**', '/js/**', '/images/**', '/favicon.ico',
  '/health/**',
  '/api/auth/set-cookie', '/api/auth/clear-cookie',
  '/api/profile/public/**', // Add new public API here
];
```

### Authentication Helpers

Use the following helpers from `utils/authz.js` instead of direct `req.user` access:

- `assertUser(req)` - Throws 401 if user not authenticated
- `hasUser(req)` - Returns boolean indicating authentication status
- `getUserId(req)` - Returns user ID or null
- `getUserEmail(req)` - Returns user email or null

**ESLint Rule**: Direct `req.user` access is forbidden outside approved auth modules.

## Health Endpoint Security

### Gated Endpoints (Require Token, IP Allowlist, or PUBLIC Mode)

All health endpoints are now gated and require authorization:

- `/health` - Returns minimal `{ok: true}` response (no internal details)
- `/health/liveness` - Returns plain text "OK" for load balancer probes
- `/health/readiness` - Detailed readiness information

### Health Shield Access Control

Health endpoints require at least one of:

1. **PUBLIC Mode**: Set `HEALTH_PUBLIC=true` (for local/dev environments only)
2. **X-Health-Token Header**: Set `X-Health-Token` to the value of `HEALTH_TOKEN` environment variable
3. **IP Allowlist**: Request from an IP in the `HEALTH_ALLOWLIST` environment variable (comma-separated)

### Ops-Only Endpoints

These endpoints require additional ops authorization:

- `/health/ops` - Comprehensive operational metrics
- `/health/detailed` - Detailed system information for debugging

Ops endpoints require either:

1. **X-Ops-Token Header**: Set `X-Ops-Token` to the value of `OPS_HEALTH_TOKEN` environment variable
2. **IP Allowlist**: Request from an IP in the `OPS_HEALTH_IPS` environment variable (comma-separated)

### Environment Variables

```bash
# Health shield access control
HEALTH_PUBLIC=false                    # Set to 'true' for local development (not recommended for production)
HEALTH_TOKEN=your-secure-token-here   # Optional token for monitoring tools
HEALTH_ALLOWLIST=127.0.0.1,::1        # Comma-separated IP allowlist (default: localhost only)

# Required for ops access to detailed endpoints
OPS_HEALTH_TOKEN=your-secure-ops-token
OPS_HEALTH_IPS=127.0.0.1,::1,your-admin-ip
```

## Security Rationale

### Default-Deny Benefits

1. **Fail-Safe**: New routes are protected by default, preventing accidental exposure
2. **Explicit Security**: Public paths must be intentionally allowlisted
3. **Audit Trail**: All blocked requests are logged for security monitoring
4. **Consistent Enforcement**: Backend is the source of truth for access control

### Health Endpoint Minimization

1. **Information Disclosure Prevention**: Public endpoints don't expose internal system details
2. **Load Balancer Compatibility**: Simple responses work with standard health check probes
3. **Ops-Only Details**: Sensitive operational information requires proper authorization
4. **Monitoring Separation**: Public health vs. detailed diagnostics are clearly separated

## Implementation Details

### Middleware Order

Security middleware is applied in this order:

1. `trust-proxy` - IP address handling
2. `request-id` - Request tracking
3. `security headers/CSP` - Security headers
4. `maintenance-guard` - Maintenance mode
5. `degrade-guard` - Redis outage handling
6. `requireAuthByDefault` - Default-deny authentication
7. `routes` - Application routes
8. `error handlers` - Error handling

### Logging

All security events are logged with structured data:

```javascript
{
  event: 'auth.default_deny',
  path: '/api/sensitive',
  method: 'GET',
  requestId: 'req-123',
  reason: 'no_authenticated_user'
}
```

This enables security monitoring and incident response.
