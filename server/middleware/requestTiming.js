'use strict';

const { performance } = require('node:perf_hooks');

const TIMING_STATE = Symbol('couplebinder.requestTiming');
const ALLOWED_METRICS = new Set([
  'total',
  'route',
  'middleware',
  'redis_firewall',
  'redis_maintenance',
  'cookie',
  'auth',
  'jwt',
  'canonical_user',
  'supabase_admin',
  'profile',
  'navigation',
  'stripe_catalog',
  'ejs',
]);

function now() {
  return performance.now();
}

function getState(req) {
  if (!req[TIMING_STATE]) {
    req[TIMING_STATE] = {
      startedAt: now(),
      metrics: new Map(),
    };
  }
  return req[TIMING_STATE];
}

function recordTiming(req, name, durationMs) {
  if (!ALLOWED_METRICS.has(name) || !Number.isFinite(durationMs) || durationMs < 0) {
    return;
  }

  const state = getState(req);
  const previous = state.metrics.get(name) || 0;
  state.metrics.set(name, previous + durationMs);
}

function startSpan(req, name) {
  const startedAt = now();
  let completed = false;

  return () => {
    if (completed) return;
    completed = true;
    recordTiming(req, name, now() - startedAt);
  };
}

async function timeAsync(req, name, operation) {
  const end = startSpan(req, name);
  try {
    return await operation();
  } finally {
    end();
  }
}

function formatServerTiming(req) {
  const state = getState(req);
  const entries = new Map(state.metrics);
  entries.set('total', now() - state.startedAt);

  return Array.from(entries.entries())
    .filter(([name]) => ALLOWED_METRICS.has(name))
    .map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`)
    .join(', ');
}

function requestTiming({ logger } = {}) {
  return (req, res, next) => {
    const state = getState(req);
    const originalWriteHead = res.writeHead;
    const originalRender = res.render;

    res.writeHead = function timedWriteHead(...args) {
      if (!res.headersSent) {
        if (Number.isFinite(state.routeStartedAt)) {
          recordTiming(req, 'route', now() - state.routeStartedAt);
          state.routeStartedAt = null;
        }
        const value = formatServerTiming(req);
        if (value) res.setHeader('Server-Timing', value);
      }
      return originalWriteHead.apply(this, args);
    };

    res.render = function timedRender(view, options, callback) {
      const end = startSpan(req, 'ejs');
      const renderOptions = typeof options === 'function' ? {} : options;
      const renderCallback = typeof options === 'function' ? options : callback;

      if (typeof renderCallback === 'function') {
        return originalRender.call(this, view, renderOptions, (error, html) => {
          end();
          renderCallback(error, html);
        });
      }

      return originalRender.call(this, view, renderOptions, (error, html) => {
        end();
        if (error) return next(error);
        return this.send(html);
      });
    };

    res.once('finish', () => {
      const duration = now() - state.startedAt;
      if (logger && typeof logger.info === 'function') {
        logger.info(
          {
            event: 'http.request.completed',
            method: req.method,
            status: res.statusCode,
            durationMs: Number(duration.toFixed(1)),
            requestId: req.requestId || undefined,
          },
          'HTTP request completed'
        );
      }
    });

    next();
  };
}

function routeTiming(req, _res, next) {
  const state = getState(req);
  if (!Number.isFinite(state.routeStartedAt)) state.routeStartedAt = now();
  next();
}

function timedMiddleware(name, middleware) {
  return (req, res, next) => {
    const end = startSpan(req, name);
    let advanced = false;

    const timedNext = (error) => {
      if (advanced) return;
      advanced = true;
      end();
      next(error);
    };

    res.once('finish', end);
    res.once('close', end);

    try {
      const result = middleware(req, res, timedNext);
      if (result && typeof result.catch === 'function') {
        result.catch(timedNext);
      }
    } catch (error) {
      timedNext(error);
    }
  };
}

module.exports = {
  recordTiming,
  requestTiming,
  routeTiming,
  startSpan,
  timeAsync,
  timedMiddleware,
};
