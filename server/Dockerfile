ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine

WORKDIR /app

# Build React app first (binder-editor)
# Copy package files first for better layer caching
COPY binder-editor/package*.json ./binder-editor/
WORKDIR /app/binder-editor
# Install all dependencies (including devDependencies needed for vite build)
# NODE_ENV is not set yet, so devDependencies will be installed
RUN if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund; \
    else \
      npm install --no-audit --no-fund; \
    fi && \
    # Verify vite is installed
    test -f node_modules/.bin/vite || (echo "ERROR: vite not found in node_modules/.bin" && exit 1)

# Copy binder-editor source files (node_modules excluded via .dockerignore)
# Copy from host binder-editor/ to current directory /app/binder-editor/
COPY binder-editor/ .
# Build React app (outputs to ../server/public/binder-editor)
# Use the direct path to vite to ensure we use the locally installed version
RUN ./node_modules/.bin/vite build

# Set NODE_ENV=production for server dependencies and runtime
ENV NODE_ENV=production

# Install server dependencies
WORKDIR /app
COPY server/package*.json ./server/
WORKDIR /app/server
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --no-audit --no-fund; \
    else \
      npm i  --omit=dev --no-audit --no-fund; \
    fi

# Copy rest of application
WORKDIR /app
COPY . .

# Ensure built React assets have correct permissions
RUN set -eux; \
  if [ -d /app/server/public/binder-editor ]; then \
    find /app/server/public/binder-editor -type d -exec chmod 0755 {} +; \
    find /app/server/public/binder-editor -type f -exec chmod 0644 {} +; \
  fi; \
  if [ -d /app/public ]; then \
    find /app/public -type d -exec chmod 0755 {} +; \
    find /app/public -type f -exec chmod 0644 {} +; \
  fi

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health/liveness', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

CMD ["node", "server/zorvalon.js"]