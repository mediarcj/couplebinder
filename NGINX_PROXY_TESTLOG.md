# Nginx Proxy Conditional SSL - Test Log

**Branch:** `fix/logout-and-trust-badge`  
**Date:** 2025-01-XX  
**Feature:** Dynamic SSL/plaintext proxy configuration based on certs and env

---

## Test Environment

- **OS:** macOS 24.6.0
- **Docker:** Compose v2
- **Nginx:** 1.27-alpine
- **Branch:** fix/logout-and-trust-badge

---

## Test 1: Dev Plaintext Mode (No Certs)

**Setup:**
```bash
# Ensure no certs exist
rm -rf certs/origin.* 2>/dev/null || true

# Ensure override is set
grep NGINX_USE_SSL docker-compose.override.yml
```

**Expected:** `NGINX_USE_SSL=false`

**Steps:**
1. `docker compose down`
2. `docker compose up --build -d proxy`
3. Check logs: `docker compose logs proxy`

**Expected Behavior:**
- Logs show: `[proxy] Using PLAINTEXT config`
- No SSL certificate errors
- Nginx starts successfully
- Health check passes: `docker compose exec proxy nginx -t`

**Observed:**
```
[ ] Pass / [ ] Fail
[ ] No SSL errors in logs
[ ] Nginx test passes
```

**Log Excerpt:**
```
[paste here]
```

---

## Test 2: Dev Plaintext With Certs Present But Not Used

**Setup:**
```bash
# Create dummy certs (self-signed)
mkdir -p certs
openssl req -x509 -nodes -days 1 -newkey rsa:2048 \
  -keyout certs/origin.key -out certs/origin.crt \
  -subj "/CN=localhost"

# Ensure override still says false
grep NGINX_USE_SSL docker-compose.override.yml
```

**Expected:** `NGINX_USE_SSL=false`

**Steps:**
1. `docker compose down`
2. `docker compose up --build -d proxy`
3. Check logs

**Expected Behavior:**
- Logs show: `[proxy] Using PLAINTEXT config`
- Certs exist but are ignored because `NGINX_USE_SSL=false`
- Nginx serves on port 80 only (no 443 errors)

**Observed:**
```
[ ] Pass / [ ] Fail
[ ] PLAINTEXT config chosen
[ ] No 443 listener errors
```

---

## Test 3: Dev Local HTTPS Mode

**Setup:**
```bash
# Certs already exist from Test 2
# Set override to use SSL
# Edit docker-compose.override.yml: NGINX_USE_SSL=true
```

**Steps:**
1. Set `NGINX_USE_SSL=true` in docker-compose.override.yml
2. `docker compose down`
3. `docker compose up --build -d proxy`
4. Check logs
5. Test HTTPS: `curl -k https://localhost/health/liveness`

**Expected Behavior:**
- Logs show: `[proxy] Using SSL config`
- Nginx starts without certificate errors
- Port 443 responds to HTTPS requests
- Port 80 redirects to HTTPS

**Observed:**
```
[ ] Pass / [ ] Fail
[ ] SSL config chosen
[ ] HTTPS responds (200 OK)
[ ] HTTP redirects (301)
```

**Log Excerpt:**
```
[paste here]
```

---

## Test 4: Prod Mode - ALB TLS Termination

**Setup:**
```bash
# Simulate production: NGINX_USE_SSL=false, but X-Forwarded-Proto preserved
# ALB terminates TLS, sends HTTP to origin with X-Forwarded-Proto: https
```

**Steps:**
1. Ensure `NGINX_USE_SSL=false`
2. Start proxy
3. Send request with `X-Forwarded-Proto: https`:
   ```bash
   curl -H "X-Forwarded-Proto: https" http://localhost/health/liveness
   ```
4. Check app receives `https` in header

**Expected Behavior:**
- Proxy preserves `X-Forwarded-Proto`
- App sees `X-Forwarded-Proto: https`
- No mixed-content or protocol mismatches

**Observed:**
```
[ ] Pass / [ ] Fail
[ ] X-Forwarded-Proto preserved
[ ] No protocol warnings
```

---

## Test 5: Prod Mode - Cloudflare Direct-to-Origin

**Setup:**
```bash
# Real origin certs, NGINX_USE_SSL=true
# (Only if you have Cloudflare origin certs)
```

**Steps:**
1. Mount real Cloudflare origin certs
2. Set `NGINX_USE_SSL=true` in production `.env`
3. Start proxy
4. Verify 443 serves without errors

**Expected Behavior:**
- SSL config selected
- Nginx serves on 443 with http2
- Valid certificate chain

**Observed:**
```
[ ] Pass / [ ] Fail
[ ] SSL with http2 enabled
[ ] Valid cert chain
```

**Note:** Skip if you don't have production origin certs available locally.

---

## Test 6: Graceful Fallback - SSL Requested But Certs Missing

**Setup:**
```bash
# Remove certs but keep NGINX_USE_SSL=true
rm certs/origin.* 2>/dev/null || true
# Set NGINX_USE_SSL=true
```

**Expected Behavior:**
- Falls back to PLAINTEXT config
- No crash
- Logs show fallback message

**Observed:**
```
[ ] Pass / [ ] Fail
[ ] Graceful fallback
[ ] No crash
```

---

## Test 7: Health Check Functionality

**Steps:**
1. Start all services
2. Wait for health checks to pass
3. Check proxy health: `docker compose ps proxy`

**Expected Behavior:**
- Proxy health: `(healthy)`
- App health: `(healthy)`
- No stuck/unhealthy states

**Observed:**
```
[ ] Pass / [ ] Fail
[ ] All services healthy
[ ] No restart loops
```

---

## Test 8: xfp Map Verification

**Steps:**
1. Test without X-Forwarded-Proto:
   ```bash
   curl http://localhost/health/liveness
   ```
2. Test with X-Forwarded-Proto: https
   ```bash
   curl -H "X-Forwarded-Proto: https" http://localhost/health/liveness
   ```
3. Test with X-Forwarded-Proto: http
   ```bash
   curl -H "X-Forwarded-Proto: http" http://localhost/health/liveness
   ```

**Expected Behavior:**
- Without header: `$xfp` = `$scheme` (http)
- With `https`: `$xfp` = `https`
- With `http`: `$xfp` = `http`

**Observed:**
```
[ ] Pass / [ ] Fail
[ ] Map works correctly
[ ] No errors in logs
```

---

## Summary

**Tests Passed:** X / 8

**Critical Issues:**
- [ ] None
- [ ] [List issues found]

**Blockers:**
- [ ] None
- [ ] [List blockers]

---

## Acceptance Criteria

### Must Pass
- [x] Dev starts without certs
- [ ] Dev plaintext mode works
- [ ] Dev HTTPS mode works (if testing local certs)
- [ ] No nginx crash on startup
- [ ] Health checks pass
- [ ] X-Forwarded-Proto preserved

### Nice to Have
- [ ] Production certs tested
- [ ] HTTP/2 verified
- [ ] Performance acceptable

---

**Test completed by:** [Your name]  
**Status:** Ready for review  
**Ready to merge:** [ ] Yes [ ] No

