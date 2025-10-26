# File: server/Dockerfile
# Description: Docker configuration for Detechify server
# Purpose: Creates secure containerized environment for production deployment
# Notes: Uses Alpine Linux, non-root user, and includes health checks
# Keeps it simple (no build step), pins Node via ARG, runs as non-root.

# Declare the ARG BEFORE using it in FROM, and give it a sane default (LTS).
ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-alpine

# PDF deps (Chromium + fonts)
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont \
  wqy-zenhei \
  font-noto \
  font-noto-cjk

# Let puppeteer-core know where Chromium lives
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
ENV NODE_ENV=production

# Install prod deps with lockfile fidelity
COPY package*.json ./
RUN npm install --omit=dev

# Copy the app
COPY . .

# Use the built-in non-root user that ships with node images
USER node

EXPOSE 3000

# Health check against your liveness route
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health/liveness', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

# Start (uses your package.json "start" script)
CMD ["npm", "start"]