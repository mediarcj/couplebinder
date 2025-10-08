# Server Toggles (Feature Flags for Ops)

Safe, auditable, deploy-friendly feature flags for production operations.

## Overview

Server toggles allow ops/devops to enable/disable features without code changes. Useful for debugging, gradual rollouts, and incident response.

## Configuration

All toggles are configured via environment variables with sensible defaults.

### Available Toggles

| Toggle | Env Var | Default | Description |
|--------|---------|---------|-------------|
| `env` | `NODE_ENV` | `production` | Environment name |
| `logLevel` | `LOG_LEVEL` | `info` | Logging level |
| `blockCmsScans` | `BLOCK_CMS_SCANS` | `true` | Block common CMS scanner paths (WordPress, PHP) |
| `corsDebug` | `CORS_DEBUG` | `false` | Log CORS request details (noisy, debug only) |
| `exposeDebugRoutes` | `EXPOSE_DEBUG_ROUTES` | `false` | Enable `/_debug` routes |

### Boolean Values

Truthy: `1`, `true`, `yes`, `on`, `y`  
Falsy: `0`, `false`, `no`, `off`, `n`  
Empty: Uses default value  
Other: Any non-empty string enables the toggle

## Usage

### Systemd Service

Add to `/etc/systemd/system/detechify.service`:

```ini
[Service]
Environment="BLOCK_CMS_SCANS=true"
Environment="CORS_DEBUG=false"
Environment="EXPOSE_DEBUG_ROUTES=false"
```

Reload and restart:
```bash
sudo systemctl daemon-reload
sudo systemctl restart detechify.service
```

### AWS SSM Parameter Store

```bash
# Create parameters
aws ssm put-parameter \
  --name /detechify/prod/BLOCK_CMS_SCANS \
  --value "true" \
  --type String

aws ssm put-parameter \
  --name /detechify/prod/CORS_DEBUG \
  --value "false" \
  --type String

# Fetch in your startup script
export BLOCK_CMS_SCANS=$(aws ssm get-parameter --name /detechify/prod/BLOCK_CMS_SCANS --query 'Parameter.Value' --output text)
export CORS_DEBUG=$(aws ssm get-parameter --name /detechify/prod/CORS_DEBUG --query 'Parameter.Value' --output text)
```

### Docker Compose

```yaml
services:
  app:
    environment:
      - BLOCK_CMS_SCANS=true
      - CORS_DEBUG=false
      - EXPOSE_DEBUG_ROUTES=false
```

### Local Development

```bash
# Enable debug routes for local troubleshooting
EXPOSE_DEBUG_ROUTES=true CORS_DEBUG=true npm start
```

## Debug Routes

When `EXPOSE_DEBUG_ROUTES=true`, the following endpoints are available:

### `GET /_debug/flags`

Returns current toggle values:

```json
{
  "env": "development",
  "logLevel": "info",
  "blockCmsScans": true,
  "corsDebug": true,
  "exposeDebugRoutes": true,
  "node": "v23.10.0"
}
```

### `GET /_debug/ping`

Simple health check:

```json
{
  "ok": true
}
```

## Middleware

### Block CMS Scans (`BLOCK_CMS_SCANS=true`)

**What**: Returns 404 for common CMS scanner paths  
**Why**: Reduces log noise and prevents unnecessary processing  
**Patterns**:
- `*.php` files
- `/wp-*` WordPress paths
- `/adminer`, `/phpmyadmin`, etc.

**Example**:
```bash
$ curl -I http://localhost:3000/wp-admin.php
HTTP/1.1 404 Not Found
```

### CORS Debug (`CORS_DEBUG=true`)

**What**: Logs CORS request details to console  
**Why**: Temporary troubleshooting for CORS issues  
**Output**:
```
[CORS-DEBUG] {"path":"/api/submissions","method":"POST","origin":"https://app.detechify.com"}
```

**⚠️ Warning**: Very noisy. Only enable when actively debugging CORS issues.

## Security Considerations

1. **Default Off**: Debug routes are off by default
2. **No Secrets**: Debug endpoints never expose environment variables or secrets
3. **Audit Trail**: All toggle changes require env var updates (auditable via git/SSM/systemd)
4. **IP Allowlist**: Consider adding IP restrictions to `/_debug` routes for production

## Production Deployment

### Example: Enable CMS blocking, disable debug

```bash
# Update systemd service
sudo systemctl edit detechify.service

# Add:
# [Service]
# Environment="BLOCK_CMS_SCANS=true"
# Environment="CORS_DEBUG=false"
# Environment="EXPOSE_DEBUG_ROUTES=false"

# Restart
sudo systemctl restart detechify.service
```

### Example: Temporarily enable CORS debug

```bash
# Update env
sudo systemctl set-environment CORS_DEBUG=true

# Restart
sudo systemctl restart detechify.service

# Watch logs
sudo journalctl -u detechify.service -f | grep CORS-DEBUG

# Disable after troubleshooting
sudo systemctl unset-environment CORS_DEBUG
sudo systemctl restart detechify.service
```

## Building Laws Compliance

✅ **Law #7**: Simple, readable code  
✅ **Law #9**: Backend-enforced configuration  
✅ **Law #11**: Centralized security and middleware  
✅ **Law #17**: All config from environment variables  
✅ **Law #26**: No concurrency issues (read-only at boot)

