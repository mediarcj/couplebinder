/**
 * File: server/public/js/register.js
 * Description: Dedicated registration page script
 * Purpose: Handles validation and Supabase user registration on the register page
 */

const registerLog = (typeof window !== 'undefined' && window.logger) ? window.logger : {
  info: () => {},
  error: () => {},
  warn: () => {}
};

let REGISTER_IN_PROGRESS = false;

const REGISTER_LIMITS = {
  NAME_MAX: 40,
  EMAIL_MAX: 40,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 40,
  PASS_MAX: 40, // deprecated alias (back-compat with legacy helpers)
  PHONE_MAX: 15
};

const REGISTER_FIELD_ERRORS = [
  'registerDisplayNameError',
  'registerEmailError',
  'registerPhoneError',
  'registerPasswordError',
  'confirmPasswordError'
];

function showRegisterMessage(message, isSuccess = false) {
  const container = document.getElementById('registerMessageContainer');
  const messageEl = document.getElementById('registerGeneralMessage');
  if (!container || !messageEl) return;
  messageEl.textContent = message;
  messageEl.classList.remove('hidden');
  container.classList.remove('hidden');
  messageEl.classList.toggle('register-message--success', Boolean(isSuccess));
}

function clearRegisterMessage() {
  const container = document.getElementById('registerMessageContainer');
  const messageEl = document.getElementById('registerGeneralMessage');
  if (!container || !messageEl) return;
  messageEl.textContent = '';
  messageEl.classList.add('hidden');
  messageEl.classList.remove('register-message--success');
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
  REGISTER_FIELD_ERRORS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = '';
      el.classList.add('hidden');
    }
  });
}

function sanitizeRegisterData(form) {
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());

  data.display_name = (data.display_name || '').trim().slice(0, REGISTER_LIMITS.NAME_MAX);
  data.email = (data.email || '').trim().slice(0, REGISTER_LIMITS.EMAIL_MAX);
  data.password = (data.password || '').slice(0, REGISTER_LIMITS.PASS_MAX);
  data.confirm_password = (data.confirm_password || '').slice(0, REGISTER_LIMITS.PASS_MAX);
  data.phone = (data.phone || '').replace(/\D+/g, '').slice(0, REGISTER_LIMITS.PHONE_MAX);

  if (form.registerDisplayName) form.registerDisplayName.value = data.display_name;
  if (form.registerEmail) form.registerEmail.value = data.email;
  if (form.registerPassword) form.registerPassword.value = data.password;
  if (form.registerConfirmPassword) form.registerConfirmPassword.value = data.confirm_password;
  if (form.registerPhone) form.registerPhone.value = data.phone;

  return data;
}

function validateDisplayName(displayName) {
  if (!displayName) return 'Display name is required';
  if (displayName.length < 2) return 'Display name must be at least 2 characters long';
  if (displayName.length > REGISTER_LIMITS.NAME_MAX) return `Display name must be ${REGISTER_LIMITS.NAME_MAX} characters or less`;
  const validDisplayNameRegex = /^[a-zA-Z0-9\s'-._]+$/;
  if (!validDisplayNameRegex.test(displayName)) {
    return 'Display name can only contain letters, numbers, spaces, hyphens, apostrophes, periods, and underscores';
  }
  return '';
}

function validateRegisterEmail(email) {
  if (!email) return 'Email address is required';
  if (email.length > REGISTER_LIMITS.EMAIL_MAX) return `Email address must be ${REGISTER_LIMITS.EMAIL_MAX} characters or less`;
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

function validateRegisterPassword(password) {
  if (!password) return 'Password is required';
  if (password.length < REGISTER_LIMITS.PASSWORD_MIN) return `Password must be at least ${REGISTER_LIMITS.PASSWORD_MIN} characters`;
  if (password.length > REGISTER_LIMITS.PASSWORD_MAX) return `Password must be ${REGISTER_LIMITS.PASSWORD_MAX} characters or less`;
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
  if (phone.length > REGISTER_LIMITS.PHONE_MAX) return `Phone must be ${REGISTER_LIMITS.PHONE_MAX} digits or less`;
  return '';
}

/**
 * Map Supabase auth errors to user-friendly messages and targets.
 * Returns { target: 'general'|'email'|'password', uiMessage: string }.
 */
function mapSupabaseRegisterError(err) {
  const status = err?.status;
  const code = (err?.code || '').toLowerCase();
  const msg = (err?.message || '').toLowerCase();

  // True "registration disabled" signal (instance setting)
  if (
    status === 422 &&
    (msg.includes('signups not allowed') || msg.includes('registration not allowed') || code === 'signup_disabled' || code === 'signup_disabled_for_instance')
  ) {
    return { target: 'general', uiMessage: 'Registration is currently disabled. Please try again later or contact support.' };
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
  return { target: 'general', uiMessage: `Registration failed: ${err?.message || 'Unknown error'}` };
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  if (REGISTER_IN_PROGRESS) return;

  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn?.textContent;

  clearFieldErrors();
  clearRegisterMessage();

  const data = sanitizeRegisterData(form);

  let hasErrors = false;
  const displayNameError = validateDisplayName(data.display_name);
  if (displayNameError) {
    showFieldError('registerDisplayNameError', displayNameError);
    hasErrors = true;
  }

  const emailError = validateRegisterEmail(data.email);
  if (emailError) {
    showFieldError('registerEmailError', emailError);
    hasErrors = true;
  }

  const passwordError = validateRegisterPassword(data.password);
  if (passwordError) {
    showFieldError('registerPasswordError', passwordError);
    hasErrors = true;
  }

  const confirmPasswordError = validateConfirmPassword(data.password, data.confirm_password);
  if (confirmPasswordError) {
    showFieldError('confirmPasswordError', confirmPasswordError);
    hasErrors = true;
  }

  const phoneError = validatePhone(data.phone);
  if (phoneError) {
    showFieldError('registerPhoneError', phoneError);
    hasErrors = true;
  }

  if (hasErrors) return;

  REGISTER_IN_PROGRESS = true;
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
    registerLog.info('register.start', { event: 'register.start', email: data.email });

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
      const mapped = mapSupabaseRegisterError(authError);

      // Structured client log
      registerLog.error('register.failed', {
        event: 'register.failed',
        status: authError.status || null,
        code: authError.code || null,
        rawMessage: authError.message || null,
        mappedTarget: mapped.target
      });

      if (mapped.target === 'email') {
        showFieldError('registerEmailError', mapped.uiMessage);
      } else if (mapped.target === 'password') {
        showFieldError('registerPasswordError', mapped.uiMessage);
      } else {
        showRegisterMessage(mapped.uiMessage);
      }
      return;
    }

    if (!authData?.user) {
      registerLog.error('register.failed.no_user', {
        event: 'register.failed.no_user',
        email: data.email
      });
      showRegisterMessage('Registration failed: please try again.');
      return;
    }

    // Success telemetry
    registerLog.info('register.success', {
      event: 'register.success',
      userId: authData.user.id,
      email: data.email
    });

    // Many projects require email confirmation: user exists but no session.
    clearFieldErrors();
    showRegisterMessage(`Welcome ${data.display_name}! Your account has been created. Redirecting to login…`, true);

    setTimeout(() => {
      window.location.replace('/login?register_success=1');
    }, 1200);
  } catch (error) {
    registerLog.error('register.error', {
      event: 'register.error',
      message: error?.message || String(error)
    });
    const message = error?.message ? `Registration failed: ${error.message}` : 'Network error. Please try again.';
    showRegisterMessage(message);
  } finally {
    REGISTER_IN_PROGRESS = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
}

function initRegisterPage() {
  const form = document.getElementById('registerForm');
  if (form) {
    form.addEventListener('submit', handleRegisterSubmit);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRegisterPage);
} else {
  initRegisterPage();
}