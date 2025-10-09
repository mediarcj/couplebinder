# Security Test Scripts

This directory contains executable security verification scripts that prove the enterprise-grade security posture of the Detechify application.

## Scripts Overview

### `test_auth_csrf.sh`
**Purpose:** Verifies authentication and CSRF protection mechanisms  
**Tests:**
- Unauthenticated access blocking (401)
- Invalid token rejection
- CSRF protection verification
- Security headers validation
- CORS configuration

**Usage:**
```bash
./scripts/test_auth_csrf.sh
```

### `verify_canonical_data.sh`
**Purpose:** Verifies canonical data flow from database to dashboard  
**Tests:**
- Dashboard template data source verification
- buildCanonicalUser structure validation
- v_profiles_full usage confirmation
- RLS compliance verification
- JWT metadata extraction validation

**Usage:**
```bash
./scripts/verify_canonical_data.sh
```

### `db_sanity_check.sh`
**Purpose:** Validates database schema and RLS policies  
**Tests:**
- v_profiles_full structure validation
- RLS policies verification
- last_sign_in_at security gating
- Definer function security
- View access grants validation

**Usage:**
```bash
./scripts/db_sanity_check.sh
```

### `edge_hardening_check.sh`
**Purpose:** Verifies security headers and edge hardening  
**Tests:**
- Security headers comprehensive check
- CSP nonce implementation
- PII logging verification
- Input validation coverage
- Error handling security
- CORS configuration
- Session security validation

**Usage:**
```bash
./scripts/edge_hardening_check.sh
```

## Prerequisites

1. **Server Running:** Ensure the Detechify server is running on `http://localhost:3000`
2. **Dependencies:** Scripts use standard Unix tools (`curl`, `grep`, `sed`)
3. **Permissions:** Scripts must be executable (`chmod +x scripts/*.sh`)

## Running All Tests

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Run all security tests
for script in scripts/*.sh; do
  echo "Running $(basename $script)..."
  $script
  echo ""
done
```

## Expected Results

All scripts should complete with:
- **VERIFIED** status for all security checks
- **Exit code 0** for successful verification
- **Comprehensive coverage** of enterprise security requirements

## CI/CD Integration

These scripts are automatically executed in the GitHub Actions workflow:
- On every pull request to `main`
- On every push to `main`
- All tests must pass for deployment approval

## Security Standards

These scripts verify compliance with:
- **OWASP ASVS Level 2/3**
- **NIST Cybersecurity Framework**
- **Enterprise Security Standards**
- **Banking/Military Grade Requirements**
