# File: server/Dockerfile
# Description: Detechify server image (lean, prod-only deps, non-root)
# Build context MUST be the server/ directory (compose: context: ./server)

ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine

# App dir + runtime env
WORKDIR /app
ENV NODE_ENV=production

# Install production deps (prefer lockfile if present)
# We copy only the package files first to leverage Docker layer caching.
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm i --omit=dev; fi

# Bring in the app source (everything under server/)
# After this, /app contains zorvalon.js, config/, routes/, public/, etc.
COPY . .

# Normalize permissions for static assets (if present)
RUN set -eux; \
  if [ -d /app/public ]; then \
    find /app/public -type d -exec chmod 0755 {} +; \
    find /app/public -type f -exec chmod 0644 {} +; \
  fi

# Drop privileges
USER node

# Network + health
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health/liveness', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

# Start the server (entrypoint is at /app/zorvalon.js)
CMD ["node", "server/zorvalon.js"]