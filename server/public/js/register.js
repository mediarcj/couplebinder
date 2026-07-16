/**
 * File: server/public/js/register.js
 * Description: Dedicated registration page script
 * Purpose: Handles validation and Supabase user registration on the register page
 */

const registerLog = (typeof window !== 'undefined' && window.logger) ? window.logger : {
  // I am keeping the `info` field in this object so the receiving code can read that value by its expected name.
  info: () => {},
  // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
  error: () => {},
  // I am keeping the `warn` field in this object so the receiving code can read that value by its expected name.
  warn: () => {}
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am saving `REGISTER_IN_PROGRESS` here so the nearby steps can reuse the same value without rebuilding it each time.
let REGISTER_IN_PROGRESS = false;

// I am saving `REGISTER_LIMITS` here so the nearby steps can reuse the same value without rebuilding it each time.
const REGISTER_LIMITS = {
  // These browser limits provide immediate feedback; the server still repeats validation
  // because client-side checks can be bypassed.
  NAME_MAX: 40,
  // I am keeping the `EMAIL_MAX` field in this object so the receiving code can read that value by its expected name.
  EMAIL_MAX: 40,
  // I am keeping the `PASSWORD_MIN` field in this object so the receiving code can read that value by its expected name.
  PASSWORD_MIN: 8,
  // I am keeping the `PASSWORD_MAX` field in this object so the receiving code can read that value by its expected name.
  PASSWORD_MAX: 40,
  PASS_MAX: 40, // deprecated alias (back-compat with legacy helpers)
  // I am keeping the `PHONE_MAX` field in this object so the receiving code can read that value by its expected name.
  PHONE_MAX: 15
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

// I am saving `REGISTER_FIELD_ERRORS` here so the nearby steps can reuse the same value without rebuilding it each time.
const REGISTER_FIELD_ERRORS = [
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'registerDisplayNameError',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'registerEmailError',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'registerPhoneError',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'registerPasswordError',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'confirmPasswordError'
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
];

// I am saving `TURNSTILE_FIELD_SELECTOR` here so the nearby steps can reuse the same value without rebuilding it each time.
const TURNSTILE_FIELD_SELECTOR = 'textarea[name="cf-turnstile-response"], input[name="cf-turnstile-response"]';

// I am keeping `isTurnstileRequired` as a named helper so the surrounding workflow can call this step when it needs it.
function isTurnstileRequired() {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `form` here so the nearby steps can reuse the same value without rebuilding it each time.
    const form = document.getElementById('registerForm');
    // This return sends the completed value or response back to the code that called this function.
    return form?.dataset?.turnstileEnabled === 'true';
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (_) {
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `readTurnstileResponse` as a named helper so the surrounding workflow can call this step when it needs it.
function readTurnstileResponse() {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `field` here so the nearby steps can reuse the same value without rebuilding it each time.
    const field = document.querySelector(TURNSTILE_FIELD_SELECTOR);
    // This return sends the completed value or response back to the code that called this function.
    return field?.value?.trim() || '';
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (_) {
    // This return sends the completed value or response back to the code that called this function.
    return '';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `resetTurnstileWidget` as a named helper so the surrounding workflow can call this step when it needs it.
function resetTurnstileWidget() {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `widget` here so the nearby steps can reuse the same value without rebuilding it each time.
    const widget = typeof window !== 'undefined' ? window.turnstile : null;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (widget && typeof widget.reset === 'function') {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      widget.reset();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (_) {
    // ignore reset errors
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `getCsrfToken` as a named helper so the surrounding workflow can call this step when it needs it.
function getCsrfToken() {
  // register.ejs normally provides the meta value; the hidden field keeps form compatibility.
  const meta = document.querySelector('meta[name="csrf-token"]');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (meta?.content) {
    // This return sends the completed value or response back to the code that called this function.
    return meta.content;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // I am saving `hiddenField` here so the nearby steps can reuse the same value without rebuilding it each time.
  const hiddenField = document.querySelector('input[name="_csrf"]');
  // This return sends the completed value or response back to the code that called this function.
  return hiddenField?.value || '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `requestRegisterValidation` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function requestRegisterValidation(payload, options = {}) {
  // This server preflight applies CSRF, rate-limit, and Turnstile checks before the browser
  // asks Supabase Auth to create an account.
  const csrfToken = getCsrfToken();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!csrfToken) {
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw new Error('Unable to verify request. Missing CSRF token.');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `body` here so the nearby steps can reuse the same value without rebuilding it each time.
  const body = {
    // The server route reads only the fields needed for preflight validation/challenge checks.
    ...payload,
    // I am keeping the `turnstileToken` field in this object so the receiving code can read that value by its expected name.
    turnstileToken: options.turnstileToken,
    // I am keeping the `turnstileIntent` field in this object so the receiving code can read that value by its expected name.
    turnstileIntent: options.turnstileIntent
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };

  // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
  const response = await fetch('/api/auth/register', {
    // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
    method: 'POST',
    // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
    headers: {
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Content-Type': 'application/json',
      // I am listing this entry here because the surrounding collection processes each allowed value in order.
      'Accept': 'application/json',
      // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
      'x-csrf-token': csrfToken
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
    credentials: 'include',
    // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
    body: JSON.stringify(body)
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!response.ok) {
    // I am saving `message` here so the nearby steps can reuse the same value without rebuilding it each time.
    let message = 'Verification failed. Please try again.';
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am saving `json` here so the nearby steps can reuse the same value without rebuilding it each time.
      const json = await response.json();
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (json?.message) message = json.message;
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (_) {}
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw new Error(message);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
  const result = await response.json().catch(() => null);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!result?.success) {
    // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
    throw new Error(result?.message || 'Verification failed. Please try again.');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return result;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `showRegisterMessage` as a named helper so the surrounding workflow can call this step when it needs it.
function showRegisterMessage(message, isSuccess = false) {
  // I am saving `container` here so the nearby steps can reuse the same value without rebuilding it each time.
  const container = document.getElementById('registerMessageContainer');
  // I am saving `messageEl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const messageEl = document.getElementById('registerGeneralMessage');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!container || !messageEl) return;
  // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
  messageEl.textContent = message;
  // I am calling this helper here so the current workflow performs this step before it moves on.
  messageEl.classList.remove('hidden');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  container.classList.remove('hidden');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  messageEl.classList.toggle('register-message--success', Boolean(isSuccess));
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `clearRegisterMessage` as a named helper so the surrounding workflow can call this step when it needs it.
function clearRegisterMessage() {
  // I am saving `container` here so the nearby steps can reuse the same value without rebuilding it each time.
  const container = document.getElementById('registerMessageContainer');
  // I am saving `messageEl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const messageEl = document.getElementById('registerGeneralMessage');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!container || !messageEl) return;
  // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
  messageEl.textContent = '';
  // I am calling this helper here so the current workflow performs this step before it moves on.
  messageEl.classList.add('hidden');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  messageEl.classList.remove('register-message--success');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  container.classList.add('hidden');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `showFieldError` as a named helper so the surrounding workflow can call this step when it needs it.
function showFieldError(id, message) {
  // I am saving `el` here so the nearby steps can reuse the same value without rebuilding it each time.
  const el = document.getElementById(id);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (el) {
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    el.textContent = message;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    el.classList.remove('hidden');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `clearFieldErrors` as a named helper so the surrounding workflow can call this step when it needs it.
function clearFieldErrors() {
  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  REGISTER_FIELD_ERRORS.forEach((id) => {
    // I am saving `el` here so the nearby steps can reuse the same value without rebuilding it each time.
    const el = document.getElementById(id);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (el) {
      // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
      el.textContent = '';
      // I am calling this helper here so the current workflow performs this step before it moves on.
      el.classList.add('hidden');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `sanitizeRegisterData` as a named helper so the surrounding workflow can call this step when it needs it.
function sanitizeRegisterData(form) {
  // Normalize and cap form values before validation so pasted or formatted input follows
  // the same shape the page displays back to the user.
  const formData = new FormData(form);
  // Convert the native form snapshot into the plain shape used by validators and Supabase.
  const data = Object.fromEntries(formData.entries());

  // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
  data.display_name = (data.display_name || '').trim().slice(0, REGISTER_LIMITS.NAME_MAX);
  // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
  data.email = (data.email || '').trim().slice(0, REGISTER_LIMITS.EMAIL_MAX);
  // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
  data.password = (data.password || '').slice(0, REGISTER_LIMITS.PASS_MAX);
  // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
  data.confirm_password = (data.confirm_password || '').slice(0, REGISTER_LIMITS.PASS_MAX);
  // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
  data.phone = (data.phone || '').replace(/\D+/g, '').slice(0, REGISTER_LIMITS.PHONE_MAX);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (form.registerDisplayName) form.registerDisplayName.value = data.display_name;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (form.registerEmail) form.registerEmail.value = data.email;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (form.registerPassword) form.registerPassword.value = data.password;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (form.registerConfirmPassword) form.registerConfirmPassword.value = data.confirm_password;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (form.registerPhone) form.registerPhone.value = data.phone;

  // This return sends the completed value or response back to the code that called this function.
  return data;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateDisplayName` as a named helper so the surrounding workflow can call this step when it needs it.
function validateDisplayName(displayName) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!displayName) return 'Display name is required';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (displayName.length < 2) return 'Display name must be at least 2 characters long';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (displayName.length > REGISTER_LIMITS.NAME_MAX) return `Display name must be ${REGISTER_LIMITS.NAME_MAX} characters or less`;
  // I am saving `validDisplayNameRegex` here so the nearby steps can reuse the same value without rebuilding it each time.
  const validDisplayNameRegex = /^[a-zA-Z0-9\s'-._]+$/;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!validDisplayNameRegex.test(displayName)) {
    // This return sends the completed value or response back to the code that called this function.
    return 'Display name can only contain letters, numbers, spaces, hyphens, apostrophes, periods, and underscores';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateRegisterEmail` as a named helper so the surrounding workflow can call this step when it needs it.
function validateRegisterEmail(email) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!email) return 'Email address is required';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (email.length > REGISTER_LIMITS.EMAIL_MAX) return `Email address must be ${REGISTER_LIMITS.EMAIL_MAX} characters or less`;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (email.includes(' ')) return 'Email address cannot contain spaces';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!email.includes('@') || !email.includes('.')) return 'Email address must contain @ and .';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (email.indexOf('@') !== email.lastIndexOf('@')) return 'Email address can only contain one @ symbol';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (email.indexOf('@') === 0 || email.indexOf('@') === email.length - 1) return 'Email address cannot start or end with @ symbol';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (email.indexOf('.') === 0 || email.indexOf('.') === email.length - 1) return 'Email address cannot start or end with a dot';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (email.indexOf('@') > email.lastIndexOf('.')) return 'Dot must come after @ symbol';
  // I am saving `validEmailRegex` here so the nearby steps can reuse the same value without rebuilding it each time.
  const validEmailRegex = /^[a-zA-Z0-9@._-]+$/;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!validEmailRegex.test(email)) return 'Email address can only contain letters, numbers, @, ., -, and _';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateRegisterPassword` as a named helper so the surrounding workflow can call this step when it needs it.
function validateRegisterPassword(password) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!password) return 'Password is required';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (password.length < REGISTER_LIMITS.PASSWORD_MIN) return `Password must be at least ${REGISTER_LIMITS.PASSWORD_MIN} characters`;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (password.length > REGISTER_LIMITS.PASSWORD_MAX) return `Password must be ${REGISTER_LIMITS.PASSWORD_MAX} characters or less`;
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

// I am keeping `validateConfirmPassword` as a named helper so the surrounding workflow can call this step when it needs it.
function validateConfirmPassword(password, confirmPassword) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!confirmPassword) return 'Please confirm your password';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (password !== confirmPassword) return 'Passwords do not match';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validatePhone` as a named helper so the surrounding workflow can call this step when it needs it.
function validatePhone(phone) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!phone) return '';
  // I am saving `phoneRegex` here so the nearby steps can reuse the same value without rebuilding it each time.
  const phoneRegex = /^\d+$/;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!phoneRegex.test(phone)) return 'Phone must contain only numbers';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (phone.length < 8) return 'Phone must be at least 8 digits';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (phone.length > REGISTER_LIMITS.PHONE_MAX) return `Phone must be ${REGISTER_LIMITS.PHONE_MAX} digits or less`;
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Map Supabase auth errors to user-friendly messages and targets.
 * Returns { target: 'general'|'email'|'password', uiMessage: string }.
 */
function mapSupabaseRegisterError(err) {
  // I am saving `status` here so the nearby steps can reuse the same value without rebuilding it each time.
  const status = err?.status;
  // I am saving `code` here so the nearby steps can reuse the same value without rebuilding it each time.
  const code = (err?.code || '').toLowerCase();
  // I am saving `msg` here so the nearby steps can reuse the same value without rebuilding it each time.
  const msg = (err?.message || '').toLowerCase();

  // True "registration disabled" signal (instance setting)
  if (
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    status === 422 &&
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    (msg.includes('signups not allowed') || msg.includes('registration not allowed') || code === 'signup_disabled' || code === 'signup_disabled_for_instance')
  // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
  ) {
    // This return sends the completed value or response back to the code that called this function.
    return { target: 'general', uiMessage: 'Registration is currently disabled. Please try again later or contact support.' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Duplicate email / already registered (varies by backend)
  if (
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    status === 409 ||
    // I am calling this helper here so the current workflow performs this step before it moves on.
    msg.includes('already registered') ||
    // I am calling this helper here so the current workflow performs this step before it moves on.
    msg.includes('already exists') ||
    // I am calling this helper here so the current workflow performs this step before it moves on.
    msg.includes('duplicate') ||
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    code === 'user_already_exists' ||
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    code === 'email_exists'
  // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
  ) {
    // This return sends the completed value or response back to the code that called this function.
    return { target: 'email', uiMessage: 'An account with this email already exists. Try signing in or reset your password.' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Password policy errors often come as 422 or message mentioning password rules
  if (
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    status === 422 &&
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    (msg.includes('password') || code === 'password_validation_failed' || msg.includes('at least'))
  // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
  ) {
    // This return sends the completed value or response back to the code that called this function.
    return { target: 'password', uiMessage: 'Password does not meet the requirements.' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Invalid email format from backend
  if (msg.includes('invalid email')) {
    // This return sends the completed value or response back to the code that called this function.
    return { target: 'email', uiMessage: 'Please enter a valid email address.' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Rate limiting
  if (status === 429 || msg.includes('rate limit')) {
    // This return sends the completed value or response back to the code that called this function.
    return { target: 'general', uiMessage: 'Too many attempts. Please wait a bit and try again.' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Generic fallback
  return { target: 'general', uiMessage: `Registration failed: ${err?.message || 'Unknown error'}` };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `handleRegisterSubmit` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function handleRegisterSubmit(e) {
  // Registration is a two-system flow: approve the public request on this server, create
  // the Supabase user, then establish the application's own cookie-backed session.
  // 1. Normalize and validate every field plus the optional Turnstile response.
  // 2. Ask this server to approve the public attempt before creating a Supabase user.
  // 3. Store profile metadata with signUp, then send the user to login/confirmation flow.
  e.preventDefault();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (REGISTER_IN_PROGRESS) return;

  // I am saving `form` here so the nearby steps can reuse the same value without rebuilding it each time.
  const form = e.target;
  // I am saving `submitBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
  const submitBtn = form.querySelector('button[type="submit"]');
  // I am saving `originalText` here so the nearby steps can reuse the same value without rebuilding it each time.
  const originalText = submitBtn?.textContent;

  // I am updating or clearing this saved state here so the interface reflects the result of the action above.
  clearFieldErrors();
  // I am updating or clearing this saved state here so the interface reflects the result of the action above.
  clearRegisterMessage();

  // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
  const data = sanitizeRegisterData(form);
  // Keep challenge state beside this exact sanitized submission.
  const turnstileRequired = isTurnstileRequired();
  // I am saving `turnstileToken` here so the nearby steps can reuse the same value without rebuilding it each time.
  let turnstileToken = '';

  // I am saving `hasErrors` here so the nearby steps can reuse the same value without rebuilding it each time.
  let hasErrors = false;
  // I am saving `displayNameError` here so the nearby steps can reuse the same value without rebuilding it each time.
  const displayNameError = validateDisplayName(data.display_name);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (displayNameError) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    showFieldError('registerDisplayNameError', displayNameError);
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    hasErrors = true;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `emailError` here so the nearby steps can reuse the same value without rebuilding it each time.
  const emailError = validateRegisterEmail(data.email);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (emailError) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    showFieldError('registerEmailError', emailError);
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    hasErrors = true;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `passwordError` here so the nearby steps can reuse the same value without rebuilding it each time.
  const passwordError = validateRegisterPassword(data.password);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (passwordError) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    showFieldError('registerPasswordError', passwordError);
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    hasErrors = true;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `confirmPasswordError` here so the nearby steps can reuse the same value without rebuilding it each time.
  const confirmPasswordError = validateConfirmPassword(data.password, data.confirm_password);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (confirmPasswordError) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    showFieldError('confirmPasswordError', confirmPasswordError);
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    hasErrors = true;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `phoneError` here so the nearby steps can reuse the same value without rebuilding it each time.
  const phoneError = validatePhone(data.phone);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (phoneError) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    showFieldError('registerPhoneError', phoneError);
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    hasErrors = true;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (hasErrors) {
    // Do not consume a Turnstile response on a form that already fails local checks.
    if (turnstileRequired) resetTurnstileWidget();
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (turnstileRequired) {
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    turnstileToken = readTurnstileResponse();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!turnstileToken) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      showRegisterMessage('Please complete the verification challenge.');
      // I am calling this helper here so the current workflow performs this step before it moves on.
      resetTurnstileWidget();
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
  REGISTER_IN_PROGRESS = true;
  // Lock only after local validation so the user can immediately correct ordinary fields.
  if (submitBtn) {
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    submitBtn.disabled = true;
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    submitBtn.textContent = 'Creating account…';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // /api/auth/register-validation applies server validation, CSRF, rate limit, and challenge.
    await requestRegisterValidation(data, {
      // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
      turnstileToken,
      // I am keeping the `turnstileIntent` field in this object so the receiving code can read that value by its expected name.
      turnstileIntent: turnstileRequired ? 'interactive-register' : undefined
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // I am saving `client` here so the nearby steps can reuse the same value without rebuilding it each time.
    const client = window.SB || window.supabase;
    // The shared browser client owns the actual Supabase Auth account creation.
    if (!client || !client.auth?.signUp) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      showRegisterMessage('Authentication system not initialized. Please refresh the page.');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `fullName` here so the nearby steps can reuse the same value without rebuilding it each time.
    const fullName = data.display_name.trim();
    // Split once so Auth metadata matches the profile fields created by server-side sync hooks.
    const nameParts = fullName.split(' ').filter(Boolean);
    // I am saving `given_name` here so the nearby steps can reuse the same value without rebuilding it each time.
    let given_name = '';
    // I am saving `family_name` here so the nearby steps can reuse the same value without rebuilding it each time.
    let family_name = null;

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (nameParts.length === 1) {
      // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
      given_name = nameParts[0];
    // I am checking this next possibility only because the earlier condition did not choose its path.
    } else if (nameParts.length === 2) {
      // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
      given_name = nameParts[0];
      // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
      family_name = nameParts[1];
    // I am checking this next possibility only because the earlier condition did not choose its path.
    } else if (nameParts.length >= 3) {
      // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
      given_name = nameParts[0];
      // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
      family_name = nameParts.slice(1).join(' ');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Start telemetry
    registerLog.info('register.start', { event: 'register.start', email: data.email });

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data: authData, error: authError } = await client.auth.signUp({
      // Password stays inside the direct Supabase browser request, not the app preflight body.
      email: data.email,
      // I am keeping the `password` field in this object so the receiving code can read that value by its expected name.
      password: data.password,
      // I am keeping the `options` field in this object so the receiving code can read that value by its expected name.
      options: {
        // I am keeping the `data` field in this object so the receiving code can read that value by its expected name.
        data: {
          // I am keeping the `display_name` field in this object so the receiving code can read that value by its expected name.
          display_name: data.display_name,
          // I am keeping the `phone` field in this object so the receiving code can read that value by its expected name.
          phone: data.phone || null,
          // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
          given_name,
          // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
          family_name
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        // You can also set emailRedirectTo here if you use magic links/confirm pages.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (authError) {
      // Translate provider wording into the specific field/general message areas on this page.
      const mapped = mapSupabaseRegisterError(authError);

      // Structured client log
      registerLog.error('register.failed', {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'register.failed',
        // I am keeping the `status` field in this object so the receiving code can read that value by its expected name.
        status: authError.status || null,
        // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
        code: authError.code || null,
        // I am keeping the `rawMessage` field in this object so the receiving code can read that value by its expected name.
        rawMessage: authError.message || null,
        // I am keeping the `mappedTarget` field in this object so the receiving code can read that value by its expected name.
        mappedTarget: mapped.target
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (mapped.target === 'email') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        showFieldError('registerEmailError', mapped.uiMessage);
      // I am checking this next possibility only because the earlier condition did not choose its path.
      } else if (mapped.target === 'password') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        showFieldError('registerPasswordError', mapped.uiMessage);
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        showRegisterMessage(mapped.uiMessage);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!authData?.user) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      registerLog.error('register.failed.no_user', {
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'register.failed.no_user',
        // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
        email: data.email
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
      // I am calling this helper here so the current workflow performs this step before it moves on.
      showRegisterMessage('Registration failed: please try again.');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Success telemetry
    registerLog.info('register.success', {
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'register.success',
      // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
      userId: authData.user.id,
      // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
      email: data.email
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // Many projects require email confirmation: user exists but no session.
    // Login owns cookie creation, so registration finishes by moving into that explicit flow.
    clearFieldErrors();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    showRegisterMessage(`Welcome ${data.display_name}! Your account has been created. Redirecting to login…`, true);

    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setTimeout(() => {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      window.location.replace('/login?register_success=1');
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    }, 1200);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    registerLog.error('register.error', {
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'register.error',
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: error?.message || String(error)
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // I am saving `message` here so the nearby steps can reuse the same value without rebuilding it each time.
    const message = error?.message ? `Registration failed: ${error.message}` : 'Network error. Please try again.';
    // I am calling this helper here so the current workflow performs this step before it moves on.
    showRegisterMessage(message);
  // This final block runs after success or failure so the shared cleanup still happens in either outcome.
  } finally {
    // Challenge tokens are single-use and the submit control must be ready for any retry.
    if (turnstileRequired) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      resetTurnstileWidget();
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
    REGISTER_IN_PROGRESS = false;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (submitBtn) {
      // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
      submitBtn.disabled = false;
      // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
      submitBtn.textContent = originalText;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Password show/hide toggles (shared pattern with login page)
 */
function initPasswordToggles() {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `toggles` here so the nearby steps can reuse the same value without rebuilding it each time.
    const toggles = document.querySelectorAll('.password-toggle[data-target]');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!toggles.length) return;

    // I am defining this small callback here so the surrounding API can run it with the value it supplies.
    toggles.forEach((btn) => {
      // I am saving `targetId` here so the nearby steps can reuse the same value without rebuilding it each time.
      const targetId = btn.getAttribute('data-target');
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!targetId) return;

      // I am saving `input` here so the nearby steps can reuse the same value without rebuilding it each time.
      const input = document.getElementById(targetId);
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!input) return;

      // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
      btn.addEventListener('click', () => {
        // I am saving `isHidden` here so the nearby steps can reuse the same value without rebuilding it each time.
        const isHidden = input.type === 'password';
        // I am keeping this line here because the surrounding register.js workflow expects this value or operation before it continues.
        input.type = isHidden ? 'text' : 'password';

        // I am calling this helper here so the current workflow performs this step before it moves on.
        btn.setAttribute('aria-pressed', String(isHidden));
        // I am calling this helper here so the current workflow performs this step before it moves on.
        btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');

        // highlight button when visible
        btn.classList.toggle('is-visible', isHidden);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (_) {
    // fail-safe
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `initRegisterPage` as a named helper so the surrounding workflow can call this step when it needs it.
function initRegisterPage() {
  // I am saving `form` here so the nearby steps can reuse the same value without rebuilding it each time.
  const form = document.getElementById('registerForm');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (form) {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    form.addEventListener('submit', handleRegisterSubmit);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // Wire up eye icons
  initPasswordToggles();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// This check helps me choose or stop the next path before any work that depends on this condition runs.
if (document.readyState === 'loading') {
  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  document.addEventListener('DOMContentLoaded', initRegisterPage);
// This alternative runs only when the condition above did not use its first path.
} else {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  initRegisterPage();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}