/**
 * File: server/public/js/signup.js
 * Description: Dedicated signup page script
 * Purpose: Handles validation and Supabase sign ups on the signup page
 */

const signupLog = (typeof window !== 'undefined' && window.logger) ? window.logger : {
  info: () => {},
  error: () => {},
  warn: () => {}
};

let SIGNUP_IN_PROGRESS = false;

const SIGNUP_LIMITS = {
  NAME_MAX: 40,
  EMAIL_MAX: 40,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 40,
  PASS_MAX: 40, // deprecated alias (back-compat with legacy helpers)
  PHONE_MAX: 15
};

const SIGNUP_FIELD_ERRORS = [
  'signupDisplayNameError',
  'signupEmailError',
  'signupPhoneError',
  'signupPasswordError',
  'confirmPasswordError'
];

function showSignupMessage(message, isSuccess = false) {
  const container = document.getElementById('signupMessageContainer');
  const messageEl = document.getElementById('signupGeneralMessage');
  if (!container || !messageEl) return;
  messageEl.textContent = message;
  messageEl.classList.remove('hidden');
  container.classList.remove('hidden');
  messageEl.classList.toggle('signup-message--success', Boolean(isSuccess));
}

function clearSignupMessage() {
  const container = document.getElementById('signupMessageContainer');
  const messageEl = document.getElementById('signupGeneralMessage');
  if (!container || !messageEl) return;
  messageEl.textContent = '';
  messageEl.classList.add('hidden');
  messageEl.classList.remove('signup-message--success');
  container.classList.add('hidden');
}

function showFieldError(id, message) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
  }
}

function clearFieldErrors() {
  SIGNUP_FIELD_ERRORS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = '';
      el.classList.add('hidden');
    }
  });
}

function sanitizeSignupData(form) {
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  data.display_name = (data.display_name || '').trim().slice(0, SIGNUP_LIMITS.NAME_MAX);
  data.email = (data.email || '').trim().slice(0, SIGNUP_LIMITS.EMAIL_MAX);
  data.password = (data.password || '').slice(0, SIGNUP_LIMITS.PASS_MAX);
  data.confirm_password = (data.confirm_password || '').slice(0, SIGNUP_LIMITS.PASS_MAX);
  data.phone = (data.phone || '').replace(/\D+/g, '').slice(0, SIGNUP_LIMITS.PHONE_MAX);

  if (form.signupDisplayName) form.signupDisplayName.value = data.display_name;
  if (form.signupEmail) form.signupEmail.value = data.email;
  if (form.signupPassword) form.signupPassword.value = data.password;
  if (form.signupConfirmPassword) form.signupConfirmPassword.value = data.confirm_password;
  if (form.signupPhone) form.signupPhone.value = data.phone;

  return data;
}

function validateDisplayName(displayName) {
  if (!displayName) return 'Display name is required';
  if (displayName.length < 2) return 'Display name must be at least 2 characters long';
  if (displayName.length > SIGNUP_LIMITS.NAME_MAX) return `Display name must be ${SIGNUP_LIMITS.NAME_MAX} characters or less`;
  const validDisplayNameRegex = /^[a-zA-Z0-9\s'-._]+$/;
  if (!validDisplayNameRegex.test(displayName)) {
    return 'Display name can only contain letters, numbers, spaces, hyphens, apostrophes, periods, and underscores';
  }
  return '';
}

function validateSignupEmail(email) {
  if (!email) return 'Email address is required';
  if (email.length > SIGNUP_LIMITS.EMAIL_MAX) return `Email address must be ${SIGNUP_LIMITS.EMAIL_MAX} characters or less`;
  if (email.includes(' ')) return 'Email address cannot contain spaces';
  if (!email.includes('@') || !email.includes('.')) return 'Email address must contain @ and .';
  if (email.indexOf('@') !== email.lastIndexOf('@')) return 'Email address can only contain one @ symbol';
  if (email.indexOf('@') === 0 || email.indexOf('@') === email.length - 1) return 'Email address cannot start or end with @ symbol';
  if (email.indexOf('.') === 0 || email.indexOf('.') === email.length - 1) return 'Email address cannot start or end with a dot';
  if (email.indexOf('@') > email.lastIndexOf('.')) return 'Dot must come after @ symbol';
  const validEmailRegex = /^[a-zA-Z0-9@._-]+$/;
  if (!validEmailRegex.test(email)) return 'Email address can only contain letters, numbers, @, ., -, and _';
  return '';
}

function validateSignupPassword(password) {
  if (!password) return 'Password is required';
  if (password.length < SIGNUP_LIMITS.PASSWORD_MIN) return `Password must be at least ${SIGNUP_LIMITS.PASSWORD_MIN} characters`;
  if (password.length > SIGNUP_LIMITS.PASSWORD_MAX) return `Password must be ${SIGNUP_LIMITS.PASSWORD_MAX} characters or less`;
  if (/\s/.test(password)) return 'Password cannot contain spaces';
  const validPasswordRegex = /^[a-zA-Z0-9]+$/;
  if (!validPasswordRegex.test(password)) {
    return 'Password can only contain uppercase letters, lowercase letters, and numbers';
  }
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one capital letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  return '';
}

function validateConfirmPassword(password, confirmPassword) {
  if (!confirmPassword) return 'Please confirm your password';
  if (password !== confirmPassword) return 'Passwords do not match';
  return '';
}

function validatePhone(phone) {
  if (!phone) return '';
  const phoneRegex = /^\d+$/;
  if (!phoneRegex.test(phone)) return 'Phone must contain only numbers';
  if (phone.length < 8) return 'Phone must be at least 8 digits';
  if (phone.length > SIGNUP_LIMITS.PHONE_MAX) return `Phone must be ${SIGNUP_LIMITS.PHONE_MAX} digits or less`;
  return '';
}

/**
 * Map Supabase auth errors to user-friendly messages and targets.
 * Returns { target: 'general'|'email'|'password', uiMessage: string }.
 */
function mapSupabaseSignupError(err) {
  const status = err?.status;
  const code = (err?.code || '').toLowerCase();
  const msg = (err?.message || '').toLowerCase();

  // True "signups disabled" signal (instance setting)
  if (
    status === 422 &&
    (msg.includes('signups not allowed') || code === 'signup_disabled' || code === 'signup_disabled_for_instance')
  ) {
    return { target: 'general', uiMessage: 'Sign up is currently disabled. Please try again later or contact support.' };
  }

  // Duplicate email / already registered (varies by backend)
  if (
    status === 409 ||
    msg.includes('already registered') ||
    msg.includes('already exists') ||
    msg.includes('duplicate') ||
    code === 'user_already_exists' ||
    code === 'email_exists'
  ) {
    return { target: 'email', uiMessage: 'An account with this email already exists. Try signing in or reset your password.' };
  }

  // Password policy errors often come as 422 or message mentioning password rules
  if (
    status === 422 &&
    (msg.includes('password') || code === 'password_validation_failed' || msg.includes('at least'))
  ) {
    return { target: 'password', uiMessage: 'Password does not meet the requirements.' };
  }

  // Invalid email format from backend
  if (msg.includes('invalid email')) {
    return { target: 'email', uiMessage: 'Please enter a valid email address.' };
  }

  // Rate limiting
  if (status === 429 || msg.includes('rate limit')) {
    return { target: 'general', uiMessage: 'Too many attempts. Please wait a bit and try again.' };
  }

  // Generic fallback
  return { target: 'general', uiMessage: `Sign up failed: ${err?.message || 'Unknown error'}` };
}

async function handleSignupSubmit(e) {
  e.preventDefault();
  if (SIGNUP_IN_PROGRESS) return;

  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn?.textContent;

  clearFieldErrors();
  clearSignupMessage();

  const data = sanitizeSignupData(form);

  let hasErrors = false;
  const displayNameError = validateDisplayName(data.display_name);
  if (displayNameError) {
    showFieldError('signupDisplayNameError', displayNameError);
    hasErrors = true;
  }

  const emailError = validateSignupEmail(data.email);
  if (emailError) {
    showFieldError('signupEmailError', emailError);
    hasErrors = true;
  }

  const passwordError = validateSignupPassword(data.password);
  if (passwordError) {
    showFieldError('signupPasswordError', passwordError);
    hasErrors = true;
  }

  const confirmPasswordError = validateConfirmPassword(data.password, data.confirm_password);
  if (confirmPasswordError) {
    showFieldError('confirmPasswordError', confirmPasswordError);
    hasErrors = true;
  }

  const phoneError = validatePhone(data.phone);
  if (phoneError) {
    showFieldError('signupPhoneError', phoneError);
    hasErrors = true;
  }

  if (hasErrors) return;

  SIGNUP_IN_PROGRESS = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating account…';
  }

  try {
    const client = window.SB || window.supabase;
    if (!client || !client.auth?.signUp) {
      showSignupMessage('Authentication system not initialized. Please refresh the page.');
      return;
    }

    const fullName = data.display_name.trim();
    const nameParts = fullName.split(' ').filter(Boolean);
    let given_name = '';
    let family_name = null;

    if (nameParts.length === 1) {
      given_name = nameParts[0];
    } else if (nameParts.length === 2) {
      given_name = nameParts[0];
      family_name = nameParts[1];
    } else if (nameParts.length >= 3) {
      given_name = nameParts[0];
      family_name = nameParts.slice(1).join(' ');
    }

    // Start telemetry
    signupLog.info('signup.start', { event: 'signup.start', email: data.email });

    const { data: authData, error: authError } = await client.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          display_name: data.display_name,
          phone: data.phone || null,
          given_name,
          family_name
        }
        // You can also set emailRedirectTo here if you use magic links/confirm pages.
      }
    });

    if (authError) {
      const mapped = mapSupabaseSignupError(authError);

      // Structured client log
      signupLog.error('signup.failed', {
        event: 'signup.failed',
        status: authError.status || null,
        code: authError.code || null,
        rawMessage: authError.message || null,
        mappedTarget: mapped.target
      });

      if (mapped.target === 'email') {
        showFieldError('signupEmailError', mapped.uiMessage);
      } else if (mapped.target === 'password') {
        showFieldError('signupPasswordError', mapped.uiMessage);
      } else {
        showSignupMessage(mapped.uiMessage);
      }
      return;
    }

    if (!authData?.user) {
      signupLog.error('signup.failed.no_user', {
        event: 'signup.failed.no_user',
        email: data.email
      });
      showSignupMessage('Sign up failed: please try again.');
      return;
    }

    // Success telemetry
    signupLog.info('signup.success', {
      event: 'signup.success',
      userId: authData.user.id,
      email: data.email
    });

    // Many projects require email confirmation: user exists but no session.
    clearFieldErrors();
    showSignupMessage(`Welcome ${data.display_name}! Your account has been created. Redirecting to login…`, true);

    setTimeout(() => {
      window.location.replace('/login?signup_success=1');
    }, 1200);
  } catch (error) {
    signupLog.error('signup.error', {
      event: 'signup.error',
      message: error?.message || String(error)
    });
    const message = error?.message ? `Sign up failed: ${error.message}` : 'Network error. Please try again.';
    showSignupMessage(message);
  } finally {
    SIGNUP_IN_PROGRESS = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
}

function initSignupPage() {
  const form = document.getElementById('signupForm');
  if (form) {
    form.addEventListener('submit', handleSignupSubmit);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSignupPage);
} else {
  initSignupPage();
}