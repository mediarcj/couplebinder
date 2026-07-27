/**
 * Description: Client-side JavaScript for user profile edit page
 * Purpose: Handles profile editing with read/edit mode toggle
 * Notes: Uses the escaped SSR profile model; respects CSRF; PII-safe logging
 */

// Keep a PII-safe local logger because the protected shell deliberately has no general logger.
// Use 'log' instead of 'logger' to avoid conflicts
const log = (typeof window !== 'undefined' && window.logger) ? window.logger : {
  isDebugEnabled: () => localStorage.getItem('debugProfile') === '1',
  redact: (obj) => {
    if (typeof obj === 'string') {
      return obj
        .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '[EMAIL]')
        .replace(/(\b\d{7,}\b)/g, '[PHONE]')
        .replace(/(sb-access-token=[^;]+)/g, '[TOKEN]');
    }
    if (typeof obj === 'object' && obj !== null) {
      const redacted = {};
      for (const [key, value] of Object.entries(obj)) {
        if (
          ['email', 'phone', 'token', 'password', 'auth', 'body', 'url'].some(pii => key.toLowerCase().includes(pii)) ||
          /(^|_)(user|profile|session|binder)?_?id$/i.test(key)
        ) {
          redacted[key] = '[REDACTED]';
        } else if (typeof value === 'string') {
          redacted[key] = log.redact(value);
        } else {
          redacted[key] = value;
        }
      }
      return redacted;
    }
    return obj;
  },
  info: (message, data = {}) => {
    if (log.isDebugEnabled()) {
      try { console.log(`[DEBUG] ${message}`, log.redact(data)); }
      catch { console.log(`[DEBUG] ${message}`, '[Logger error - data not logged]'); }
    }
  },
  error: (message, data = {}) => {
    try { console.error(`[ERROR] ${message}`, log.redact(data)); }
    catch { console.error(`[ERROR] ${message}`, '[Logger error - data not logged]'); }
  },
  warn: (message, data = {}) => {
    if (log.isDebugEnabled()) {
      try { console.warn(`[WARN] ${message}`, log.redact(data)); }
      catch { console.warn(`[WARN] ${message}`, '[Logger error - data not logged]'); }
    }
  }
};

// State shared by the profile field, password, and account-deletion controls.
let userProfile = null;                   // Canonical profile from server
const editingFields = new Set();          // UI fields currently in edit mode
const savingFields  = new Set();          // Prevent double-saves per field
const passwordSaving = new Set();         // Prevent double password changes
const deleteAccountSaving = new Set();   // Prevent double delete account requests

// The list of UI field names in this page
const FIELD_ORDER = [
  'displayName','email','phone','birthday','gender','language','cityProvince',
  'country','profileTitle','profileDescription','hobbies','music','favFood',
  'relationshipStatus','job','accountPrivacy'
];

 function getCsrfTokenValue() {
   // 1) Prefer the csrf_token cookie – this is exactly what the server validates
   try {
     const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
     if (m && m[1]) {
       // Decode + trim for a clean, exact match with what csrfLite reads
       return decodeURIComponent(m[1]).trim();
     }
   } catch (e) {
     log.warn('Failed to read csrf_token cookie', { error: e.message });
   }

   // 2) Fallback to hidden form field wired from EJS (ui.csrfToken)
   const formToken = document.querySelector('input[name="_csrf"]');
   if (formToken && formToken.value) {
     return String(formToken.value).trim();
   }

   // 3) Final fallback: meta tag
   const metaToken = document.querySelector('meta[name="csrf-token"]');
   if (metaToken) {
     const content = metaToken.getAttribute('content');
     return content ? String(content).trim() : '';
   }

   // If all else fails, return empty string – server will reject with 403
   return '';
 }

// These mappings keep browser field names aligned with the server's canonical profile shape.

/**
 * Map a UI field name -> canonical value from the profile object.
 *
 * UI uses friendly names; backend/view uses snake_case. This prevents drift.
 *
 * Switch on the UI field name and read correct property. For account privacy,
 * prefer canonical string, fall back to boolean.
 */
function profileValueFor(fieldName, p) {
  if (!p) return '';
  switch (fieldName) {
    case 'displayName':        return p.display_name ?? '';
    case 'email':              return p.email ?? '';
    case 'phone':              return p.phone ?? '';
    case 'birthday':           return p.birthday ?? '';
    case 'gender':             return p.gender ?? '';
    case 'language':           return p.language ?? '';
    case 'cityProvince':       return p.city_province ?? '';
    case 'country':            return p.country ?? '';
    case 'profileTitle':       return p.profile_title ?? '';
    case 'profileDescription': return p.profile_description ?? '';
    case 'hobbies':            return p.hobbies ?? '';
    case 'music':              return p.music ?? '';
    case 'favFood':            return p.fav_food ?? '';
    case 'relationshipStatus': return p.relationship_status ?? '';
    case 'job':                return p.job ?? '';
    case 'accountPrivacy': {
      if (p.account_privacy === 'public' || p.account_privacy === 'private') return p.account_privacy;
      if (typeof p.is_private === 'boolean') return p.is_private ? 'private' : 'public';
      return 'public';
    }
    default: return p[fieldName] ?? '';
  }
}

/**
 * Map a UI field name + current input value -> backend field + normalized value.
 *
 * Server expects snake_case keys; accountPrivacy sends boolean is_private.
 *
 * Switch with controlled transformations; default is pass-through.
 */
function backendFieldFor(fieldName, rawValue) {
  switch (fieldName) {
    case 'displayName':        return { field: 'display_name_override', value: rawValue ?? null };
    case 'cityProvince':       return { field: 'city_province',         value: rawValue ?? null };
    case 'profileTitle':       return { field: 'profile_title',         value: rawValue ?? null };
    case 'profileDescription': return { field: 'profile_description',   value: rawValue ?? null };
    case 'favFood':            return { field: 'fav_food',              value: rawValue ?? null };
    case 'relationshipStatus': return { field: 'relationship_status',   value: rawValue ?? null };
    case 'accountPrivacy': {
      // UI uses 'public'|'private' -> server expects boolean is_private
      const normalized = (rawValue === 'private');
      return { field: 'is_private', value: normalized };
    }
    default:
      return { field: fieldName, value: (rawValue ?? null) };
  }
}

// Page startup

/**
 * Initialize page: load profile and wire handlers.
 *
 * Keep startup deterministic; avoid races with other modules.
 *
 * Wait for DOMContentLoaded and proceed. This file does not require
 * the Supabase browser client; it talks to your server API.
 */
document.addEventListener('DOMContentLoaded', () => {
  log.info('Profile edit page loaded');
  userProfile = readProfileBootstrap();
  attachEventHandlers();
  initPasswordManager();
  initDeleteAccountFlow();
  initPasswordToggles();
  if (userProfile) displayProfileData();
  else showError('Profile data is unavailable. Please refresh the page.');
  log.info('Profile edit page initialized');
});

// Profile loading and rendering

/**
 * Read the server-rendered canonical profile without an additional network request.
 */
function readProfileBootstrap() {
  try {
    const element = document.getElementById('profile-bootstrap');
    if (!element) return null;
    const parsed = JSON.parse(element.textContent || '{}');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    log.error('Failed to parse server-rendered profile data', { error: error.message });
    return null;
  }
}

/**
 * Display all fields in read mode using canonical mapping
 */
function displayProfileData() {
  // FIELD_ORDER keeps rendering stable and routes every value through the mapping helper above.
  if (!userProfile) {
    log.warn('No user profile data available');
    return;
  }
  log.info('Displaying profile data');
  FIELD_ORDER.forEach((fn) => displayField(fn, profileValueFor(fn, userProfile)));
}

/**
 * Display a single field value in both the read label and the input
 */
function displayField(fieldName, value) {
  const displayElement = document.getElementById(`${fieldName}Display`);
  const inputElement   = document.getElementById(fieldName);

  log.info(`Displaying field: ${fieldName}`);

  // Normalize account privacy string if needed
  if (fieldName === 'accountPrivacy') {
    if (typeof value === 'boolean') value = value ? 'private' : 'public';
    if (value !== 'public' && value !== 'private') {
      value = profileValueFor('accountPrivacy', userProfile);
    }
  }

  if (displayElement) {
    let displayValue = value;
    if (Array.isArray(value)) displayValue = value.length > 0 ? value.join(', ') : null;
    displayElement.textContent = (displayValue && `${displayValue}`.trim()) || 'Not provided';
  } else {
    log.warn(`Display element not found: ${fieldName}`);
  }

  if (inputElement) {
    let inputValue = value;
    if (Array.isArray(value)) inputValue = value.length > 0 ? value.join(', ') : '';
    if (inputElement.tagName === 'SELECT') {
      inputElement.value = inputValue || '';
    } else {
      inputElement.value = inputValue || '';
    }
  } else {
    log.warn(`Input element not found: ${fieldName}`);
  }
}

// Field interaction handlers

/**
 * Attach click handlers to each field's Edit/Save button
 */
function attachEventHandlers() {
  // These IDs match profile-edit.ejs; each button toggles Edit first and Save on its next click.
  const editButtons = [
    'editDisplayName', 'editPhone', 'editBirthday', 'editGender',
    'editLanguage', 'editCityProvince', 'editCountry', 'editProfileTitle',
    'editProfileDescription', 'editHobbies', 'editMusic', 'editFavFood',
    'editRelationshipStatus', 'editJob', 'editAccountPrivacy'
  ];

  editButtons.forEach((buttonId) => {
    const button = document.getElementById(buttonId);
    if (!button) return log.warn(`Button not found: ${buttonId}`);

    button.addEventListener('click', () => {
      const fieldName = buttonId.replace('edit', '');
      const camelCaseFieldName = fieldName.charAt(0).toLowerCase() + fieldName.slice(1);
      log.info(`Edit button clicked: ${camelCaseFieldName}`);

      // If saving is in progress for this field, ignore clicks
      if (savingFields.has(camelCaseFieldName)) {
        log.warn('Save in progress; click ignored', { field: camelCaseFieldName });
        return;
      }

      if (editingFields.has(camelCaseFieldName)) {
        saveIndividualField(camelCaseFieldName);
      } else {
        toggleFieldEdit(camelCaseFieldName);
      }
    });
  });
}

/**
 * Toggle field between read and edit mode
 */
function toggleFieldEdit(fieldName) {
  // Keep display, input, button styling, editing set, and cancel action in one transition.
  const displayElement = document.getElementById(`${fieldName}Display`);
  const inputElement   = document.getElementById(fieldName);
  const editButton     = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);

  if (!displayElement || !inputElement || !editButton) return;

  if (editingFields.has(fieldName)) {
    // Switch to read mode
    displayElement.classList.remove('field-display-hidden'); displayElement.classList.add('field-display-inline');
    inputElement.classList.add('field-input-hidden');        inputElement.classList.remove('field-input-inline');
    editButton.textContent = 'Edit';
    editButton.classList.remove('btn-primary');
    editButton.classList.add('btn-small');
    editingFields.delete(fieldName);
  } else {
    // Switch to edit mode (pre-fill with canonical value to avoid stale UI)
    inputElement.value = profileValueFor(fieldName, userProfile) || '';
    displayElement.classList.add('field-display-hidden'); displayElement.classList.remove('field-display-inline');
    inputElement.classList.remove('field-input-hidden');  inputElement.classList.add('field-input-inline');
    editButton.textContent = 'Save';
    editButton.classList.remove('btn-small');
    editButton.classList.add('btn-primary');
    editingFields.add(fieldName);

    // Add cancel button
    addCancelButton(fieldName);

    // Focus the input
    inputElement.focus();
  }
}

/**
 * Save individual field with per-field in-flight guard
 */
async function saveIndividualField(fieldName) {
  // Save one field at a time so an unrelated draft is not submitted accidentally. The
  // per-field guard also prevents a fast second click from creating a duplicate request.
  // 1. Validate and map this friendly UI name to the server's allowlisted field.
  // 2. PUT one-field JSON with CSRF to profile.js/profileSyncService.
  // 3. Replace local state with the canonical response, then return this field to read mode.
  if (savingFields.has(fieldName)) return; // no double-save

  try {
    if (!userProfile) throw new Error('Profile not loaded');

    const inputElement = document.getElementById(fieldName);
    if (!inputElement) throw new Error('Field not found');

    const rawValue = inputElement.value ?? null;

    // Validate first
    const validationError = validateField(fieldName);
    if (validationError) {
      showFieldError(`${fieldName}Error`, validationError);
      return;
    }
    clearFieldError(`${fieldName}Error`);

    // Map to backend field/value
    const { field, value } = backendFieldFor(fieldName, rawValue);
    // validateProfileUpdate receives this backend key and builds the final safe patch.
    log.info(`Field mapping: ${fieldName} -> ${field}`);

    // CSRF token (required)
    const csrfToken = getCsrfTokenValue();
    log.info('CSRF token check', { found: !!csrfToken });
    if (!csrfToken) throw new Error('CSRF token not found');

    // In-flight guard + button disable
    savingFields.add(fieldName);
    const editButton = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);
    if (editButton) editButton.disabled = true;

    // Send update
    const response = await fetch('/api/profile/me', {
      // registerRoutes mounted requireAuth before profile.js, and CSRF middleware checks this header.
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({ [field]: value })
    });

    // Attempt to parse JSON error bodies safely
    if (!response.ok) {
      let errorMsg = `Update failed: ${response.status}`;
      try {
        const maybe = await response.json();
        if (maybe && maybe.message) errorMsg = maybe.message;
      } catch {}
      throw new Error(errorMsg);
    }

    const result = await response.json();
    if (!result.success) throw new Error(result.message || 'Update failed');

    // Update local profile with canonical server copy
    // This may include normalization performed across Auth metadata and the profiles table.
    userProfile = result.profile;

    // Switch field back to read mode
    const displayElement = document.getElementById(`${fieldName}Display`);
    const inputEl        = document.getElementById(fieldName);
    if (displayElement && inputEl && editButton) {
      displayElement.classList.remove('field-display-hidden'); displayElement.classList.add('field-display-inline');
      inputEl.classList.add('field-input-hidden');             inputEl.classList.remove('field-input-inline');
      editButton.textContent = 'Edit';
      editButton.classList.remove('btn-primary');
      editButton.classList.add('btn-small');
      editingFields.delete(fieldName);
    }

    // Remove cancel button
    const fieldContainer = editButton?.parentElement;
    const cancelButton = fieldContainer?.querySelector('.cancel-btn');
    if (cancelButton) cancelButton.remove();

    // Re-render the single field with canonical value
    displayField(fieldName, profileValueFor(fieldName, userProfile));

    // UX message (no-change vs updated)
    if (result.unchanged === true) {
      showInfo(`No changes made to ${getFieldDisplayName(fieldName)}`);
    } else {
      showSuccess(`${getFieldDisplayName(fieldName)} updated successfully!`);
    }
  } catch (error) {
    log.error(`Failed to save ${fieldName}:`, error);
    showFieldError(`${fieldName}Error`, `Failed to save: ${error.message}`);
  } finally {
    // Always clear in-flight guard and re-enable button
    savingFields.delete(fieldName);
    const editButton = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);
    if (editButton) editButton.disabled = false;
  }
}

/**
 * Add cancel button for field editing
 */
function addCancelButton(fieldName) {
  const editButton = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);
  const fieldContainer = editButton?.parentElement;
  if (!fieldContainer) return;

  // Already present?
  if (fieldContainer.querySelector('.cancel-btn')) return;

  // Create cancel button
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn btn-secondary cancel-btn';
  cancelButton.textContent = 'Cancel';

  // Handler
  cancelButton.addEventListener('click', () => cancelFieldEdit(fieldName));

  // Insert after edit button
  fieldContainer.insertBefore(cancelButton, editButton.nextSibling);
}

/**
 * Cancel field edit and revert to canonical profile value
 */
function cancelFieldEdit(fieldName) {
  const displayElement = document.getElementById(`${fieldName}Display`);
  const inputElement   = document.getElementById(fieldName);
  const editButton     = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);
  const fieldContainer = editButton?.parentElement;
  const cancelButton   = fieldContainer?.querySelector('.cancel-btn');

  if (!displayElement || !inputElement || !editButton) return;

  // Revert input to canonical value
  const originalValue = profileValueFor(fieldName, userProfile);
  inputElement.value = originalValue;

  // Back to read mode
  displayElement.classList.remove('field-display-hidden'); displayElement.classList.add('field-display-inline');
  inputElement.classList.add('field-input-hidden');        inputElement.classList.remove('field-input-inline');
  editButton.textContent = 'Edit';
  editButton.classList.remove('btn-primary');
  editButton.classList.add('btn-small');
  editingFields.delete(fieldName);

  // Remove cancel button
  if (cancelButton) cancelButton.remove();

  // Clear any errors
  clearFieldError(`${fieldName}Error`);
}

/**
 * Get display name for field (for messages)
 */
function getFieldDisplayName(fieldName) {
  const fieldNames = {
    'displayName': 'Display name',
    'phone': 'Phone number',
    'birthday': 'Birthday',
    'gender': 'Gender',
    'language': 'Language',
    'cityProvince': 'City/Province',
    'country': 'Country',
    'profileTitle': 'Profile title',
    'profileDescription': 'Profile description',
    'hobbies': 'Hobbies',
    'music': 'Music preferences',
    'favFood': 'Favorite food',
    'relationshipStatus': 'Relationship status',
    'job': 'Job status',
    'accountPrivacy': 'Account privacy'
  };
  return fieldNames[fieldName] || fieldName;
}

// Client-side profile validation
function validateField(fieldName) {
  const inputElement = document.getElementById(fieldName);
  if (!inputElement) return '';
  const value = inputElement.value;

  // Dates, phone numbers, names, and free text each need different validation rules.
  switch (fieldName) {
    case 'displayName':         return validateDisplayName(value, 'Display name');
    case 'phone':               return validatePhone(value);
    case 'birthday':            return validateBirthday(value);
    case 'gender':              return validateGender(value);
    case 'relationshipStatus':  return validateRelationshipStatus(value);
    case 'job':                 return validateJobStatus(value);
    case 'accountPrivacy':      return validateAccountPrivacy(value);
    case 'language':            return validateLanguage(value);
    case 'cityProvince':        return validateCityProvince(value);
    case 'country':             return validateCountry(value);
    case 'profileTitle':        return validateProfileTitle(value);
    case 'profileDescription':  return validateProfileDescription(value);
    case 'hobbies':             return validateHobbies(value);
    case 'music':               return validateMusic(value);
    case 'favFood':             return validateFavFood(value);
    default:                    return '';
  }
}

function _validateName(value, fieldName) {
  if (!value || value.trim().length === 0) return `${fieldName} is required`;
  if (value.length > 50) return `${fieldName} must be 50 characters or less`;
  return '';
}

function validateDisplayName(value, fieldName) {
  if (!value || value.trim().length === 0) return `${fieldName} is required`;
  if (value.length > 100) return `${fieldName} must be 100 characters or less`;
  if (value.length < 2) return `${fieldName} must be at least 2 characters long`;
  const validDisplayNameRegex = /^[a-zA-Z0-9\s'-._]+$/;
  if (!validDisplayNameRegex.test(value)) {
    return `${fieldName} can only contain letters, numbers, spaces, hyphens, apostrophes, periods, and underscores`;
  }
  return '';
}

function validatePhone(value) {
  if (!value) return '';
  const phoneRegex = /^[\d+()\s-]+$/;
  if (!phoneRegex.test(value)) return 'Phone number contains invalid characters';
  if (value.length > 15) return 'Phone number must be 15 characters or less';
  return '';
}

function validateBirthday(value) {
  if (!value) return '';
  const dateRegex = /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})$/;
  if (!dateRegex.test(value)) return 'Birthday must be in MM/DD/YYYY or YYYY-MM-DD format';
  return '';
}

function validateGender(value) {
  if (!value) return '';
  const validGenders = ['male', 'female'];
  if (!validGenders.includes(value)) return 'Gender must be either male or female';
  return '';
}

function validateRelationshipStatus(value) {
  if (!value) return '';
  const validStatuses = ['single', 'married'];
  if (!validStatuses.includes(value)) return 'Relationship status must be either single or married';
  return '';
}

function validateJobStatus(value) {
  if (!value) return '';
  const validStatuses = ['unemployed', 'employed'];
  if (!validStatuses.includes(value)) return 'Job status must be either unemployed or employed';
  return '';
}

function validateAccountPrivacy(value) {
  if (!value) return '';
  const validPrivacy = ['public', 'private'];
  if (!validPrivacy.includes(value)) return 'Account privacy must be either public or private';
  return '';
}

function validateLanguage(value) {
  if (!value) return '';
  if (value.length > 50) return 'Language must be 50 characters or less';
  return '';
}

function validateCityProvince(value) {
  if (!value) return '';
  if (value.length > 100) return 'City/Province must be 100 characters or less';
  return '';
}

function validateCountry(value) {
  if (!value) return '';
  if (value.length > 100) return 'Country must be 100 characters or less';
  return '';
}

function validateProfileTitle(value) {
  if (!value) return '';
  if (value.length > 140) return 'Profile title must be 140 characters or less';
  return '';
}

function validateProfileDescription(value) {
  if (!value) return '';
  if (value.length > 2000) return 'Profile description must be 2000 characters or less';
  return '';
}

function validateHobbies(value) {
  if (!value) return '';
  if (value.length > 200) return 'Hobbies must be 200 characters or less';
  return '';
}

function validateMusic(value) {
  if (!value) return '';
  if (value.length > 200) return 'Music preferences must be 200 characters or less';
  return '';
}

function validateFavFood(value) {
  if (!value) return '';
  if (value.length > 100) return 'Favorite food must be 100 characters or less';
  return '';
}

// Error and toast helpers avoid inline event code so they remain CSP-friendly.
function showFieldError(fieldId, message) {
  const errorElement = document.getElementById(fieldId);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
  }
}

function clearFieldError(fieldId) {
  const errorElement = document.getElementById(fieldId);
  if (errorElement) {
    errorElement.textContent = '';
    errorElement.classList.add('hidden');
  }
}

function showError(message) {
  const errorElement = document.getElementById('profileGeneralError');
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
  }
}

function showSuccess(message) {
  const el = document.createElement('div');
  el.className = 'success-toast is-visible';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

function showInfo(message) {
  const el = document.createElement('div');
  el.className = 'info-message info-toast is-visible';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// Password controls use their own save guard and validation messages.
function initPasswordManager() {
  // Password changes use a separate guarded flow because success invalidates the current
  // session and redirects, unlike an ordinary profile-field save.
  // Validation stays in this setup handler; submitPasswordChange owns the protected request.
  const toggleBtn = document.getElementById('passwordToggleBtn');
  const fields = document.getElementById('passwordFields');
  const cancelBtn = document.getElementById('passwordCancelBtn');
  const saveBtn = document.getElementById('passwordSaveBtn');

  if (!toggleBtn) {
    log.warn('Password toggle button not found');
    return;
  }
  if (!fields) {
    log.warn('Password fields container not found');
    return;
  }
  if (!cancelBtn) {
    log.warn('Password cancel button not found');
    return;
  }
  if (!saveBtn) {
    log.warn('Password save button not found');
    return;
  }

  toggleBtn.addEventListener('click', () => {
    // Password controls stay fixed while the request runs so the form cannot change mid-save.
    if (passwordSaving.has('password')) {
      log.warn('Password save in progress; click ignored');
      return;
    }
    toggleBtn.classList.add('hidden');
    fields.classList.remove('hidden');
  });

  cancelBtn.addEventListener('click', () => {
    if (passwordSaving.has('password')) {
      log.warn('Password save in progress; cancel ignored');
      return;
    }
    resetPasswordFields(fields, toggleBtn);
  });

  saveBtn.addEventListener('click', () => {
    if (passwordSaving.has('password')) {
      log.warn('Password save in progress; click ignored');
      return;
    }
    
    // Validate fields first
    const currentPassword = document.getElementById('currentPassword')?.value || '';
    const newPassword = document.getElementById('newPassword')?.value || '';
    const confirmPassword = document.getElementById('confirmPassword')?.value || '';

    if (!currentPassword || !newPassword || !confirmPassword) {
      showPasswordError('All password fields are required');
      return;
    }

    if (newPassword.length < 8) {
      showPasswordError('New password must be at least 8 characters');
      return;
    }

    if (newPassword.length > 50) {
      showPasswordError('New password must be 50 characters or less');
      return;
    }

    if (/\s/.test(newPassword)) {
      showPasswordError('Password cannot contain spaces');
      return;
    }

    const validPasswordRegex = /^[a-zA-Z0-9]+$/;
    if (!validPasswordRegex.test(newPassword)) {
      showPasswordError('Password can only contain uppercase letters, lowercase letters, and numbers');
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      showPasswordError('Password must contain at least one capital letter');
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      showPasswordError('Password must contain at least one number');
      return;
    }

    if (newPassword !== confirmPassword) {
      showPasswordError('New passwords do not match');
      return;
    }
    
    // Wait for modalManager to be ready (loaded statically in template)
    whenModalManagerReady((modalManager) => {
      if (!modalManager || typeof modalManager.showPasswordChangeConfirm !== 'function') {
        log.warn('modalManager.showPasswordChangeConfirm not available, proceeding without confirmation');
        submitPasswordChange(saveBtn, toggleBtn, fields);
        return;
      }
      
      log.info('Showing password change confirmation modal');
      modalManager.showPasswordChangeConfirm(
        () => {
          // On cancel - just close modal, fields remain
          log.info('Password change cancelled by user');
        },
        () => {
          // On confirm - proceed with password change
          submitPasswordChange(saveBtn, toggleBtn, fields);
        }
      );
    });
  });

  log.info('Password manager initialized successfully');
}

function resetPasswordFields(container, toggleBtn) {
  ['currentPassword', 'newPassword', 'confirmPassword'].forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.value = '';
  });
  showPasswordError('', true);
  container.classList.add('hidden');
  if (toggleBtn) toggleBtn.classList.remove('hidden');
}

function showPasswordError(message, hideOnly = false) {
  const errorEl = document.getElementById('passwordError');
  if (!errorEl) return;
  if (hideOnly || !message) {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
    return;
  }
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

async function submitPasswordChange(saveBtn, toggleBtn, container) {
  // /account/password verifies the current password, updates Supabase Auth, and clears session state.
  // In-flight guard (consistent with saveIndividualField pattern)
  if (passwordSaving.has('password')) return;

  const currentPassword = document.getElementById('currentPassword')?.value || '';
  const newPassword = document.getElementById('newPassword')?.value || '';
  const confirmPassword = document.getElementById('confirmPassword')?.value || '';

  const csrfToken = getCsrfTokenValue();
  if (!csrfToken) {
    showPasswordError('Missing security token. Please refresh and try again.');
    return;
  }

  // In-flight guard + button disable (consistent with saveIndividualField pattern)
  passwordSaving.add('password');
  saveBtn.disabled = true;
  showPasswordError('', true);

  try {
    // POST /account/password uses same CSRF pattern as PUT /api/profile/me:
    // - Send token in X-CSRF-Token header (required for JSON requests)
    // - Body _csrf is optional fallback, but header takes precedence
    const response = await fetch('/account/password', {
      // Send only JSON credentials and the request CSRF token to the protected account route.
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': csrfToken
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword
      })
    });

    if (response.redirected) {
      window.location.replace(response.url);
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Password update failed');
    }

    // Server already logged out and set redirect URL
    // Follow server redirect (no client-side logout needed)
    if (payload?.redirect) {
      window.location.replace(payload.redirect);
    } else {
      // Fallback: redirect to login page with success flag
      window.location.replace('/login?password_changed_success=1');
    }
  } catch (error) {
    log.error('Password update failed', error);
    showPasswordError(error.message || 'Password update failed');
    passwordSaving.delete('password');
    saveBtn.disabled = false;
    if (toggleBtn && container) {
      // Keep fields visible for retry
      toggleBtn.classList.add('hidden');
      container.classList.remove('hidden');
    }
  }
}

/**
 * Wait for modalManager to be ready before using it.
 *
 * modalManager.js is loaded statically in the template, but there may be a brief
 * delay before it's fully initialized. This helper ensures we wait for it.
 *
 * - Polls for window.modalManager with exponential backoff.
 * - Calls the callback once modalManager is available.
 * - Falls back gracefully if modalManager never becomes available.
 */
function whenModalManagerReady(cb, tries = 40) {
  if (window.modalManager && typeof cb === 'function') {
    return cb(window.modalManager);
  }
  if (tries <= 0) {
    log.warn('[profile-edit] modalManager not available after retries');
    if (typeof cb === 'function') {
      cb(null); // Call with null to allow fallback handling
    }
    return;
  }
  setTimeout(() => whenModalManagerReady(cb, tries - 1), 50);
}

/**
 * Password visibility toggles for password fields (shared pattern with login/register)
 */
function initPasswordToggles() {
  try {
    const toggles = document.querySelectorAll('.password-toggle[data-target]');
    if (!toggles.length) return;

    toggles.forEach((btn) => {
      const targetId = btn.getAttribute('data-target');
      if (!targetId) return;

      const input = document.getElementById(targetId);
      if (!input) return;

      btn.addEventListener('click', () => {
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';

        btn.setAttribute('aria-pressed', String(isHidden));
        btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');

        // highlight button when visible
        btn.classList.toggle('is-visible', isHidden);
      });
    });
  } catch (_) {
    // fail-safe
  }
}

// Account deletion uses a staged confirmation modal before the final request.
function initDeleteAccountFlow() {
  // The two-step modal makes the destructive action deliberate, then locks its controls
  // while the server request is running so it cannot be submitted twice.
  // All modal exits check the same deleteAccountSaving set used by submitDeleteAccount.
  const trigger = document.getElementById('deleteAccountBtn');
  const modal = document.getElementById('deleteAccountModal');
  const confirmBtn = document.getElementById('deleteAccountConfirmBtn');

  if (!trigger) {
    log.warn('Delete account trigger button not found');
    return;
  }
  if (!modal) {
    log.warn('Delete account modal not found');
    return;
  }
  if (!confirmBtn) {
    log.warn('Delete account confirm button not found');
    return;
  }

  // Once account deletion starts, every close/back/continue path stays locked until it settles.
  trigger.addEventListener('click', () => {
    if (deleteAccountSaving.has('delete')) {
      log.warn('Delete account in progress; click ignored');
      return;
    }
    openDeleteModal(modal);
  });

  modal.querySelectorAll('[data-delete-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (deleteAccountSaving.has('delete')) {
        log.warn('Delete account in progress; close ignored');
        return;
      }
      closeDeleteModal(modal);
    });
  });

  const cancelButtons = modal.querySelectorAll('[data-delete-cancel]');
  cancelButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (deleteAccountSaving.has('delete')) {
        log.warn('Delete account in progress; cancel ignored');
        return;
      }
      closeDeleteModal(modal);
    });
  });

  const continueBtn = modal.querySelector('[data-delete-continue]');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      if (deleteAccountSaving.has('delete')) {
        log.warn('Delete account in progress; continue ignored');
        return;
      }
      changeDeleteStep(modal, 'final');
    });
  }

  const backBtn = modal.querySelector('[data-delete-back]');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (deleteAccountSaving.has('delete')) {
        log.warn('Delete account in progress; back ignored');
        return;
      }
      changeDeleteStep(modal, 'cancelled');
    });
  }

  confirmBtn.addEventListener('click', () => {
    if (deleteAccountSaving.has('delete')) {
      log.warn('Delete account in progress; click ignored');
      return;
    }
    submitDeleteAccount(confirmBtn, modal);
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      if (deleteAccountSaving.has('delete')) {
        log.warn('Delete account in progress; modal close ignored');
        return;
      }
      closeDeleteModal(modal);
    }
  });

  log.info('Delete account flow initialized successfully');
}

function openDeleteModal(modal) {
  changeDeleteStep(modal, 'confirm');
  clearDeleteAccountError();
  modal.classList.add('show');
}

function closeDeleteModal(modal) {
  modal.classList.remove('show');
  changeDeleteStep(modal, 'confirm');
  clearDeleteAccountError();
}

function changeDeleteStep(modal, step) {
  modal.querySelectorAll('.delete-step').forEach((section) => {
    const desired = section.getAttribute('data-delete-step');
    section.classList.toggle('hidden', desired !== step);
  });
}

function clearDeleteAccountError() {
  const errorEl = document.getElementById('deleteAccountError');
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }
}

function showDeleteAccountError(message) {
  const errorEl = document.getElementById('deleteAccountError');
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

async function submitDeleteAccount(button, modal) {
  // The account route performs the destructive server work; this page redirects only on success.
  // In-flight guard (consistent with saveIndividualField pattern)
  if (deleteAccountSaving.has('delete')) return;

  const csrfToken = getCsrfTokenValue();
  if (!csrfToken) {
    showDeleteAccountError('Missing security token. Please refresh and try again.');
    return;
  }

  // In-flight guard + button disable (consistent with saveIndividualField pattern)
  deleteAccountSaving.add('delete');
  button.disabled = true;
  clearDeleteAccountError();

  try {
    const response = await fetch('/account/delete', {
      // Authentication comes from the HttpOnly cookie and CSRF proves this page initiated the POST.
      method: 'POST',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'X-CSRF-Token': csrfToken
      }
    });

    if (response.redirected) {
      window.location.replace(response.url);
      return;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || 'Account deletion failed');
    }

    window.location.replace('/?account_deleted=1');
  } catch (error) {
    log.error('Account deletion failed', error);
    showDeleteAccountError(error.message || 'Account deletion failed');
  } finally {
    // Always clear in-flight guard and re-enable button (consistent with saveIndividualField pattern)
    deleteAccountSaving.delete('delete');
    button.disabled = false;
    modal.classList.add('show');
  }
}

// Logout functionality is handled by the modular logout.js system
