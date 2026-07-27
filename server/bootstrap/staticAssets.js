'use strict';

const express = require('express');
const path = require('path');

const VERSIONED_ASSET = /(?:^|[?&])v=[A-Za-z0-9._-]+(?:&|$)/;

function staticHeaders(res) {
  const originalUrl = res.req?.originalUrl || '';
  const versioned = VERSIONED_ASSET.test(originalUrl);

  res.setHeader(
    'Cache-Control',
    versioned
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600, must-revalidate'
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function staticOptions() {
  return {
    etag: true,
    fallthrough: true,
    setHeaders: staticHeaders,
  };
}

function registerStaticAssets(app, { logger } = {}) {
  const legacyRoot = path.resolve(__dirname, '../public');
  const rootPublic = path.resolve(__dirname, '../../public');

  // Authored application assets live under server/public. Keep the repository-root
  // directory as a narrow fallback for the favicon and any migration-era public files.
  app.use(express.static(legacyRoot, staticOptions()));
  app.use(express.static(rootPublic, staticOptions()));

  app.get(['/images/*', '/css/*', '/js/*', '/binder-editor/*', '/robots.txt'], (_req, res) => {
    res.status(404).end();
  });

  logger?.info(
    { event: 'boot.static_pipeline_ready' },
    'Static assets mounted before stateful middleware'
  );
}

module.exports = { registerStaticAssets };
