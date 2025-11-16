#!/usr/bin/env bash
set -euo pipefail

# Fail if any process.env usage outside config or scripts/tests
# Using grep with find for portability (works without ripgrep)
find server -type f \( -name "*.js" -o -name "*.mjs" \) \
  ! -path "*/config/index.js" \
  ! -path "*/scripts/*" \
  ! -path "*/tests/*" \
  ! -path "*/__tests__/*" \
  ! -path "*/*.test.js" \
  -exec grep -Hn "process\.env\(\.\|\[\)" {} + 2>/dev/null | tee /tmp/env_offenders.txt || true

if [ -s /tmp/env_offenders.txt ]; then
  echo "Found illegal process.env usage outside config:" >&2
  cat /tmp/env_offenders.txt >&2
  exit 1
fi

# Fail if dotenv is imported outside config
find server -type f \( -name "*.js" -o -name "*.mjs" \) \
  ! -path "*/config/index.js" \
  ! -path "*/scripts/*" \
  ! -path "*/tests/*" \
  ! -path "*/__tests__/*" \
  ! -path "*/*.test.js" \
  -exec grep -Hn "\bdotenv\.config\b\|\brequire(['\"]dotenv['\"]\)" {} + 2>/dev/null | tee /tmp/dotenv_offenders.txt || true

if [ -s /tmp/dotenv_offenders.txt ]; then
  echo "Found illegal dotenv usage outside config:" >&2
  cat /tmp/dotenv_offenders.txt >&2
  exit 1
fi

echo "Env audit passed."

