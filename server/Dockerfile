ARG NODE_VERSION=20

# ----------------------------
# Build stage (compile assets)
# ----------------------------
FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app

# Needed by some native deps (sharp, etc.) on Alpine
RUN apk add --no-cache libc6-compat

# 1) Install & build binder-editor (uses its own lockfile)
COPY binder-editor/package*.json ./binder-editor/
WORKDIR /app/binder-editor
RUN if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund; \
    else \
      npm install --no-audit --no-fund; \
    fi
COPY binder-editor/ ./
RUN npm run build

# 2) Install server deps using ROOT lockfile + npm workspaces
#    (This is the key fix: no server/package-lock.json required)
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json

# Install ONLY the server workspace production deps (no devDeps)
RUN npm ci --omit=dev --no-audit --no-fund --workspace=server --include-workspace-root=false

# 3) Copy server source
COPY server/ ./server/

# 4) Copy root public (only if it exists in your repo)
COPY public/ ./public/


# ----------------------------
# Runtime stage (small + safe)
# ----------------------------
FROM node:${NODE_VERSION}-alpine AS runtime
RUN apk add --no-cache tini libc6-compat
ENV NODE_ENV=production

WORKDIR /app

# Copy app + deps (workspace deps live at /app/node_modules)
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/server /app/server
COPY --from=build /app/public /app/public

# Permissions for non-root runtime
RUN set -eux; \
  chown -R node:node /app; \
  find /app -type d -exec chmod 0755 {} +; \
  find /app -type f -exec chmod 0644 {} +

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health/liveness', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

USER node
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","server/zorvalon.js"]