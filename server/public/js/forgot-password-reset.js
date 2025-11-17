/**
 * File: server/public/js/forgot-password-reset.js
 * Description: Handles Supabase recovery tokens on the reset password page
 */

function parseRecoveryHash() {
  const hash = window.location.hash || '';
  if (!hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  const type = params.get('type');
  if (type !== 'recovery') return null;
  const accessToken = params.get('access_token');
  if (!accessToken) return null;
  return accessToken;
}

document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('recoveryAccessToken');
  const form = document.querySelector('[data-recovery-form]');
  const message = document.querySelector('[data-recovery-message]');

  const token = parseRecoveryHash();
  if (token && tokenInput && form) {
    tokenInput.value = token;
    form.classList.remove('hidden');
    if (message) message.classList.add('hidden');
    try {
      history.replaceState({}, '', window.location.pathname + window.location.search);
    } catch {
      // ignore history issues
    }
  } else if (message) {
    message.classList.remove('hidden');
  }
});

