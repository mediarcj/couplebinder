/**
 * File: server/public/js/forgot-password-reset.js
 * Description: Handles Supabase recovery tokens on the reset password page
 * Purpose: Validates password requirements and handles form submission
 */

function parseRecoveryHash() {
  // Supabase returns recovery credentials in the URL fragment, which is available to the
  // browser but is not sent to the server as part of the page request.
  const hash = window.location.hash || '';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!hash.startsWith('#')) return null;
  // I am saving `params` here so the nearby steps can reuse the same value without rebuilding it each time.
  const params = new URLSearchParams(hash.slice(1));
  // I am saving `type` here so the nearby steps can reuse the same value without rebuilding it each time.
  const type = params.get('type');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (type !== 'recovery') return null;
  // I am saving `accessToken` here so the nearby steps can reuse the same value without rebuilding it each time.
  const accessToken = params.get('access_token');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!accessToken) return null;
  // This return sends the completed value or response back to the code that called this function.
  return accessToken;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // Mirror the reset form's server policy for immediate feedback; the server remains the
  // final authority before changing authentication data.
  if (!password) return 'Password is required';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (password.length < 8) return 'Password must be at least 8 characters';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (password.length > 50) return 'Password must be 50 characters or less';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (/\s/.test(password)) return 'Password cannot contain spaces';
  // I am saving `validPasswordRegex` here so the nearby steps can reuse the same value without rebuilding it each time.
  const validPasswordRegex = /^[a-zA-Z0-9]+$/;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!validPasswordRegex.test(password)) {
    // This return sends the completed value or response back to the code that called this function.
    return 'Password can only contain uppercase letters, lowercase letters, and numbers';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one capital letter';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `showError` as a named helper so the surrounding workflow can call this step when it needs it.
function showError(message) {
  // I am saving `errorEl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const errorEl = document.getElementById('passwordError');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (errorEl) {
    // I am keeping this line here because the surrounding forgot-password-reset.js workflow expects this value or operation before it continues.
    errorEl.textContent = message;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errorEl.classList.remove('hidden');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `clearError` as a named helper so the surrounding workflow can call this step when it needs it.
function clearError() {
  // I am saving `errorEl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const errorEl = document.getElementById('passwordError');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (errorEl) {
    // I am keeping this line here because the surrounding forgot-password-reset.js workflow expects this value or operation before it continues.
    errorEl.textContent = '';
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errorEl.classList.add('hidden');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
document.addEventListener('DOMContentLoaded', () => {
  // I am saving `tokenInput` here so the nearby steps can reuse the same value without rebuilding it each time.
  const tokenInput = document.getElementById('recoveryAccessToken');
  // I am saving `form` here so the nearby steps can reuse the same value without rebuilding it each time.
  const form = document.querySelector('[data-recovery-form]');
  // I am saving `message` here so the nearby steps can reuse the same value without rebuilding it each time.
  const message = document.querySelector('[data-recovery-message]');
  // I am saving `newPasswordInput` here so the nearby steps can reuse the same value without rebuilding it each time.
  const newPasswordInput = document.getElementById('resetNewPassword');
  // I am saving `confirmPasswordInput` here so the nearby steps can reuse the same value without rebuilding it each time.
  const confirmPasswordInput = document.getElementById('resetConfirmPassword');

  // I am saving `token` here so the nearby steps can reuse the same value without rebuilding it each time.
  const token = parseRecoveryHash();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (token && tokenInput && form) {
    // I am keeping this line here because the surrounding forgot-password-reset.js workflow expects this value or operation before it continues.
    tokenInput.value = token;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    form.classList.remove('hidden');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (message) message.classList.add('hidden');
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      history.replaceState({}, '', window.location.pathname + window.location.search);
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch {
      // ignore history issues
    }
  // I am checking this next possibility only because the earlier condition did not choose its path.
  } else if (message) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    message.classList.remove('hidden');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Add real-time password validation
  if (newPasswordInput) {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    newPasswordInput.addEventListener('input', () => {
      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      clearError();
      // I am saving `password` here so the nearby steps can reuse the same value without rebuilding it each time.
      const password = newPasswordInput.value;
      // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
      const error = validatePassword(password);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (error) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        showError(error);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Add form submission validation
  if (form) {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    form.addEventListener('submit', (e) => {
      // I am saving `newPassword` here so the nearby steps can reuse the same value without rebuilding it each time.
      const newPassword = newPasswordInput?.value || '';
      // I am saving `confirmPassword` here so the nearby steps can reuse the same value without rebuilding it each time.
      const confirmPassword = confirmPasswordInput?.value || '';

      // I am updating or clearing this saved state here so the interface reflects the result of the action above.
      clearError();

      // Validate new password
      const passwordError = validatePassword(newPassword);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (passwordError) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        e.preventDefault();
        // I am calling this helper here so the current workflow performs this step before it moves on.
        showError(passwordError);
        // This return sends the completed value or response back to the code that called this function.
        return false;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // Validate passwords match
      if (newPassword !== confirmPassword) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        e.preventDefault();
        // I am calling this helper here so the current workflow performs this step before it moves on.
        showError('Passwords do not match');
        // This return sends the completed value or response back to the code that called this function.
        return false;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // This return sends the completed value or response back to the code that called this function.
      return true;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});
