ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY server/package*.json ./server/
WORKDIR /app/server
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --no-audit --no-fund; \
    else \
      npm i  --omit=dev --no-audit --no-fund; \
    fi

WORKDIR /app
COPY . .

RUN set -eux; \
  if [ -d /app/public ]; then \
    find /app/public -type d -exec chmod 0755 {} +; \
    find /app/public -type f -exec chmod 0644 {} +; \
  fi

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health/liveness', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

CMD ["node", "server/zorvalon.js"]