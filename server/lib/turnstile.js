// Description: Shared Cloudflare Turnstile verification helper
// Notes: Centralizes verification so login and registration reuse a single path

'use strict';

const { config } = require('../config');
const { getClientIP } = require('../middleware/security');

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_TIMEOUT_MS = 5000;

function isTurnstileEnabled() {
  // Treat partial configuration as disabled so no route sends an unverifiable challenge.
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
  // Browser forms and JSON clients have used a few field names over time. Normalize
  // them here so routes do not each grow their own slightly different parser.
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
  // 1. Decide whether this route/intent must verify a challenge.
  // 2. Send token, secret, and client IP to Cloudflare with a short timeout.
  // 3. Return a small neutral result so each route chooses its user-facing response.
  if (!isTurnstileEnabled()) {
    return { ok: true, enforced: false };
  }

  const intent = typeof options.intent === 'string'
    // Intent names bind interactive tokens to the login/register flow that requested them.
    ? options.intent.trim()
    : '';
  const tokenSource = options.token ?? req.body ?? {};
  const token = extractTurnstileToken(tokenSource);

  // Login/register are always interactive checks. Other callers may explicitly enforce
  // the challenge, while a supplied token is never silently ignored.
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
  // URLSearchParams produces the form encoding expected by Cloudflare's siteverify endpoint.
  form.append('secret', config.turnstile.secretKey);
  form.append('response', token);

  const clientIp = options.ip || getClientIP(req);
  if (clientIp) {
    form.append('remoteip', clientIp);
  }

  const controller = new AbortController();
  // Do not let an upstream verification outage hold an application request open.
  // Once enforcement begins, timeout/network failures stay closed and the route decides
  // how to present that failure to the user.
  const timeout = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      // Node's global fetch carries only verification fields; application cookies are not forwarded.
      method: 'POST',
      body: form,
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { ok: false, code: 'bad_response', status: response.status, enforced: true };
    }

    const result = await response.json().catch(() => ({}));
    // Treat malformed success bodies as rejection instead of assuming verification passed.
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
