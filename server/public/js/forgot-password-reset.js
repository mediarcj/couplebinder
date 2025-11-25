/**
 * File: server/public/js/forgot-password-reset.js
 * Description: Handles Supabase recovery tokens on the reset password page
 * Purpose: Validates password requirements and handles form submission
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

/**
 * Validate password according to requirements:
 * - Minimum 8 characters
 * - At least 1 capital letter
 * - At least 1 number
 * - No spaces
 * - No special characters (only letters and numbers)
 */
function validatePassword(password) {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 50) return 'Password must be 50 characters or less';
  if (/\s/.test(password)) return 'Password cannot contain spaces';
  const validPasswordRegex = /^[a-zA-Z0-9]+$/;
  if (!validPasswordRegex.test(password)) {
    return 'Password can only contain uppercase letters, lowercase letters, and numbers';
  }
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one capital letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return '';
}

function showError(message) {
  const errorEl = document.getElementById('passwordError');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
}

function clearError() {
  const errorEl = document.getElementById('passwordError');
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const tokenInput = document.getElementById('recoveryAccessToken');
  const form = document.querySelector('[data-recovery-form]');
  const message = document.querySelector('[data-recovery-message]');
  const newPasswordInput = document.getElementById('resetNewPassword');
  const confirmPasswordInput = document.getElementById('resetConfirmPassword');

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

  // Add real-time password validation
  if (newPasswordInput) {
    newPasswordInput.addEventListener('input', () => {
      clearError();
      const password = newPasswordInput.value;
      const error = validatePassword(password);
      if (error) {
        showError(error);
      }
    });
  }

  // Add form submission validation
  if (form) {
    form.addEventListener('submit', (e) => {
      const newPassword = newPasswordInput?.value || '';
      const confirmPassword = confirmPasswordInput?.value || '';

      clearError();

      // Validate new password
      const passwordError = validatePassword(newPassword);
      if (passwordError) {
        e.preventDefault();
        showError(passwordError);
        return false;
      }

      // Validate passwords match
      if (newPassword !== confirmPassword) {
        e.preventDefault();
        showError('Passwords do not match');
        return false;
      }

      return true;
    });
  }
});

