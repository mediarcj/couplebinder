#!/usr/bin/env bash
set -euo pipefail

fix_dir() {
  local d="$1"
  [ -d "$d" ] || return 0
  # Directories 755, files 644
  find "$d" -type d -exec chmod 0755 {} +
  find "$d" -type f -exec chmod 0644 {} +
}

fix_dir "public"
fix_dir "server/public"
echo "Public permissions normalized."
