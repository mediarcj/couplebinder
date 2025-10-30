# File: server/Dockerfile
# Description: Detechify server image (lean, prod-only deps, non-root)
# Notes: Build context is repo root; this Dockerfile lives in server/

# 1) Base image
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine

# 2) App directory and env
WORKDIR /app
ENV NODE_ENV=production

# 3) Install production deps using lockfile if available
#    We copy only the server's package files to leverage Docker layer caching.
COPY server/package*.json ./
# If package-lock.json exists, npm ci; else npm i
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm i --omit=dev; fi

# 4) Copy application code
#    Place server code under /app/server so `node server/zorvalon.js` works.
COPY server/ ./server/

# 5) Bring in repo-root public/ for static assets (if present)
COPY public /app/public

# 6) Normalize permissions for static assets (fixes the /aap typo)
RUN set -eux; \
  if [ -d /app/public ]; then \
    find /app/public -type d -exec chmod 0755 {} +; \
    find /app/public -type f -exec chmod 0644 {} +; \
  fi

# 7) Drop privileges
USER node

# 8) Network + health
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health/liveness', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

# 9) Start the server (no build step; files live in /app/server)
CMD ["node", "server/zorvalon.js"]