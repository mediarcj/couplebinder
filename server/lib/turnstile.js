// File: server/lib/turnstile.js
// Description: Shared Cloudflare Turnstile verification helper
// Notes: Centralizes verification so login and registration reuse a single path

'use strict';

const { config } = require('../config');
const { getClientIP } = require('../middleware/security');

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_TIMEOUT_MS = 5000;

function isTurnstileEnabled() {
  return Boolean(
    config.turnstile &&
    config.turnstile.enabled &&
    config.turnstile.siteKey &&
    config.turnstile.secretKey
  );
}

function extractTurnstileToken(source) {
  if (!source) return '';
  if (typeof source === 'string') {
    return source.trim();
  }
  const candidates = [
    source.turnstileToken,
    source['turnstile-token'],
    source['cf-turnstile-response'],
    source.cfTurnstileResponse,
    source.turnstile_response,
    source.cfTurnstileToken
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return '';
}

async function verifyTurnstileRequest(req, options = {}) {
  if (!isTurnstileEnabled()) {
    return { ok: true, enforced: false };
  }

  const intent = typeof options.intent === 'string'
    ? options.intent.trim()
    : '';
  const tokenSource = options.token ?? req.body ?? {};
  const token = extractTurnstileToken(tokenSource);

  const enforceCheck =
    options.enforce === true ||
    intent === 'interactive-login' ||
    intent === 'interactive-register' ||
    Boolean(token);

  if (!enforceCheck) {
    return { ok: true, enforced: false };
  }

  if (!token) {
    return { ok: false, code: 'missing_token', enforced: true };
  }

  const form = new URLSearchParams();
  form.append('secret', config.turnstile.secretKey);
  form.append('response', token);

  const clientIp = options.ip || getClientIP(req);
  if (clientIp) {
    form.append('remoteip', clientIp);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: form,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { ok: false, code: 'bad_response', status: response.status, enforced: true };
    }

    const result = await response.json().catch(() => ({}));
    if (result.success === true) {
      return { ok: true, enforced: true };
    }

    return {
      ok: false,
      code: 'rejected',
      errors: result['error-codes'] || [],
      enforced: true
    };
  } catch (error) {
    clearTimeout(timeout);
    const code = error.name === 'AbortError' ? 'timeout' : 'network_error';
    return { ok: false, code, enforced: true };
  }
}

module.exports = {
  verifyTurnstileRequest,
  extractTurnstileToken
};

