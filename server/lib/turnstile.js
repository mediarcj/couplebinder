// File: server/lib/turnstile.js
// Description: Shared Cloudflare Turnstile verification helper
// Notes: Centralizes verification so login and registration reuse a single path

'use strict';

// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');
// I am loading `../middleware/security` into `getClientIP` so this file can reuse that dependency below.
const { getClientIP } = require('../middleware/security');

// I am saving `TURNSTILE_VERIFY_URL` here so the nearby steps can reuse the same value without rebuilding it each time.
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// I am saving `TURNSTILE_TIMEOUT_MS` here so the nearby steps can reuse the same value without rebuilding it each time.
const TURNSTILE_TIMEOUT_MS = 5000;

// I am keeping `isTurnstileEnabled` as a named helper so the surrounding workflow can call this step when it needs it.
function isTurnstileEnabled() {
  // Treat partial configuration as disabled so no route sends an unverifiable challenge.
  return Boolean(
    // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
    config.turnstile &&
    // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
    config.turnstile.enabled &&
    // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
    config.turnstile.siteKey &&
    // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
    config.turnstile.secretKey
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  );
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `extractTurnstileToken` as a named helper so the surrounding workflow can call this step when it needs it.
function extractTurnstileToken(source) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!source) return '';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof source === 'string') {
    // This return sends the completed value or response back to the code that called this function.
    return source.trim();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // Browser forms and JSON clients have used a few field names over time. Normalize
  // them here so routes do not each grow their own slightly different parser.
  const candidates = [
    // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
    source.turnstileToken,
    // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
    source['turnstile-token'],
    // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
    source['cf-turnstile-response'],
    // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
    source.cfTurnstileResponse,
    // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
    source.turnstile_response,
    // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
    source.cfTurnstileToken
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ];
  // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
  for (const candidate of candidates) {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof candidate === 'string' && candidate.trim()) {
      // This return sends the completed value or response back to the code that called this function.
      return candidate.trim();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `verifyTurnstileRequest` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function verifyTurnstileRequest(req, options = {}) {
  // 1. Decide whether this route/intent must verify a challenge.
  // 2. Send token, secret, and client IP to Cloudflare with a short timeout.
  // 3. Return a small neutral result so each route chooses its user-facing response.
  if (!isTurnstileEnabled()) {
    // This return sends the completed value or response back to the code that called this function.
    return { ok: true, enforced: false };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `intent` here so the nearby steps can reuse the same value without rebuilding it each time.
  const intent = typeof options.intent === 'string'
    // Intent names bind interactive tokens to the login/register flow that requested them.
    ? options.intent.trim()
    // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
    : '';
  // I am saving `tokenSource` here so the nearby steps can reuse the same value without rebuilding it each time.
  const tokenSource = options.token ?? req.body ?? {};
  // I am saving `token` here so the nearby steps can reuse the same value without rebuilding it each time.
  const token = extractTurnstileToken(tokenSource);

  // Login/register are always interactive checks. Other callers may explicitly enforce
  // the challenge, while a supplied token is never silently ignored.
  const enforceCheck =
    // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
    options.enforce === true ||
    // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
    intent === 'interactive-login' ||
    // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
    intent === 'interactive-register' ||
    // I am calling this helper here so the current workflow performs this step before it moves on.
    Boolean(token);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!enforceCheck) {
    // This return sends the completed value or response back to the code that called this function.
    return { ok: true, enforced: false };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!token) {
    // This return sends the completed value or response back to the code that called this function.
    return { ok: false, code: 'missing_token', enforced: true };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `form` here so the nearby steps can reuse the same value without rebuilding it each time.
  const form = new URLSearchParams();
  // URLSearchParams produces the form encoding expected by Cloudflare's siteverify endpoint.
  form.append('secret', config.turnstile.secretKey);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  form.append('response', token);

  // I am saving `clientIp` here so the nearby steps can reuse the same value without rebuilding it each time.
  const clientIp = options.ip || getClientIP(req);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (clientIp) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    form.append('remoteip', clientIp);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `controller` here so the nearby steps can reuse the same value without rebuilding it each time.
  const controller = new AbortController();
  // Do not let an upstream verification outage hold an application request open.
  // Once enforcement begins, timeout/network failures stay closed and the route decides
  // how to present that failure to the user.
  const timeout = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      // Node's global fetch carries only verification fields; application cookies are not forwarded.
      method: 'POST',
      // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
      body: form,
      // I am keeping the `signal` field in this object so the receiving code can read that value by its expected name.
      signal: controller.signal
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    clearTimeout(timeout);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!response.ok) {
      // This return sends the completed value or response back to the code that called this function.
      return { ok: false, code: 'bad_response', status: response.status, enforced: true };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
    const result = await response.json().catch(() => ({}));
    // Treat malformed success bodies as rejection instead of assuming verification passed.
    if (result.success === true) {
      // This return sends the completed value or response back to the code that called this function.
      return { ok: true, enforced: true };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return {
      // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
      ok: false,
      // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
      code: 'rejected',
      // I am keeping the `errors` field in this object so the receiving code can read that value by its expected name.
      errors: result['error-codes'] || [],
      // I am keeping the `enforced` field in this object so the receiving code can read that value by its expected name.
      enforced: true
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    clearTimeout(timeout);
    // I am saving `code` here so the nearby steps can reuse the same value without rebuilding it each time.
    const code = error.name === 'AbortError' ? 'timeout' : 'network_error';
    // This return sends the completed value or response back to the code that called this function.
    return { ok: false, code, enforced: true };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from turnstile.js.
module.exports = {
  // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
  verifyTurnstileRequest,
  // I am keeping this line here because the surrounding turnstile.js workflow expects this value or operation before it continues.
  extractTurnstileToken
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
