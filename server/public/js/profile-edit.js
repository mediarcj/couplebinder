/**
 * File: server/public/js/profile-edit.js
 * Description: Client-side JavaScript for user profile edit page
 * Purpose: Handles profile editing with read/edit mode toggle
 * Notes: Fetches canonical profile via /api/profile/me; respects CSRF; PII-safe logging
 */

/* ============================================================
   Use logger from main.js (exposed as window.logger)
   Note: profile-edit.js loads BEFORE main.js, so we use a fallback
   ============================================================ */
// Use 'log' instead of 'logger' to avoid conflicts
const log = (typeof window !== 'undefined' && window.logger) ? window.logger : {
  // I am keeping the `isDebugEnabled` field in this object so the receiving code can read that value by its expected name.
  isDebugEnabled: () => localStorage.getItem('debugProfile') === '1',
  // I am keeping the `redact` field in this object so the receiving code can read that value by its expected name.
  redact: (obj) => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof obj === 'string') {
      // This return sends the completed value or response back to the code that called this function.
      return obj
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '[EMAIL]')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .replace(/(\b\d{7,}\b)/g, '[PHONE]')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .replace(/(sb-access-token=[^;]+)/g, '[TOKEN]');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof obj === 'object' && obj !== null) {
      // I am saving `redacted` here so the nearby steps can reuse the same value without rebuilding it each time.
      const redacted = {};
      // I am repeating the next block one item at a time so every value in the existing collection receives the same handling.
      for (const [key, value] of Object.entries(obj)) {
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (['email', 'phone', 'token', 'password', 'auth'].some(pii => key.toLowerCase().includes(pii))) {
          // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
          redacted[key] = '[REDACTED]';
        // I am checking this next possibility only because the earlier condition did not choose its path.
        } else if (typeof value === 'string') {
          // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
          redacted[key] = log.redact(value);
        // This alternative runs only when the condition above did not use its first path.
        } else {
          // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
          redacted[key] = value;
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // This return sends the completed value or response back to the code that called this function.
      return redacted;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This return sends the completed value or response back to the code that called this function.
    return obj;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  // I am keeping the `info` field in this object so the receiving code can read that value by its expected name.
  info: (message, data = {}) => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (log.isDebugEnabled()) {
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try { console.log(`[DEBUG] ${message}`, log.redact(data)); }
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      catch { console.log(`[DEBUG] ${message}`, '[Logger error - data not logged]'); }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
  error: (message, data = {}) => {
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try { console.error(`[ERROR] ${message}`, log.redact(data)); }
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    catch { console.error(`[ERROR] ${message}`, '[Logger error - data not logged]'); }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  },
  // I am keeping the `warn` field in this object so the receiving code can read that value by its expected name.
  warn: (message, data = {}) => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (log.isDebugEnabled()) {
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try { console.warn(`[WARN] ${message}`, log.redact(data)); }
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      catch { console.warn(`[WARN] ${message}`, '[Logger error - data not logged]'); }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};

/* ============================================================
   Global state
   ============================================================ */
let userProfile = null;                   // Canonical profile from server
const editingFields = new Set();          // UI fields currently in edit mode
const savingFields  = new Set();          // Prevent double-saves per field
const passwordSaving = new Set();         // Prevent double password changes
const deleteAccountSaving = new Set();   // Prevent double delete account requests

// The list of UI field names in this page
const FIELD_ORDER = [
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'displayName','email','phone','birthday','gender','language','cityProvince',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'country','profileTitle','profileDescription','hobbies','music','favFood',
  // I am listing this entry here because the surrounding collection processes each allowed value in order.
  'relationshipStatus','job','accountPrivacy'
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
];

 // I am keeping `getCsrfTokenValue` as a named helper so the surrounding workflow can call this step when it needs it.
 function getCsrfTokenValue() {
   // 1) Prefer the csrf_token cookie – this is exactly what the server validates
   try {
     // I am saving `m` here so the nearby steps can reuse the same value without rebuilding it each time.
     const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
     // This check helps me choose or stop the next path before any work that depends on this condition runs.
     if (m && m[1]) {
       // Decode + trim for a clean, exact match with what csrfLite reads
       return decodeURIComponent(m[1]).trim();
     // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
     }
   // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
   } catch (e) {
     // I am calling this helper here so the current workflow performs this step before it moves on.
     log.warn('Failed to read csrf_token cookie', { error: e.message });
   // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
   }

   // 2) Fallback to hidden form field wired from EJS (ui.csrfToken)
   const formToken = document.querySelector('input[name="_csrf"]');
   // This check helps me choose or stop the next path before any work that depends on this condition runs.
   if (formToken && formToken.value) {
     // This return sends the completed value or response back to the code that called this function.
     return String(formToken.value).trim();
   // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
   }

   // 3) Final fallback: meta tag
   const metaToken = document.querySelector('meta[name="csrf-token"]');
   // This check helps me choose or stop the next path before any work that depends on this condition runs.
   if (metaToken) {
     // I am saving `content` here so the nearby steps can reuse the same value without rebuilding it each time.
     const content = metaToken.getAttribute('content');
     // This return sends the completed value or response back to the code that called this function.
     return content ? String(content).trim() : '';
   // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
   }

   // If all else fails, return empty string – server will reject with 403
   return '';
 // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
 }

/* ============================================================
   Field mapping helpers (single source of truth)
   ============================================================ */

/**
 * WHAT:
 * Map a UI field name -> canonical value from the profile object.
 *
 * WHY:
 * UI uses friendly names; backend/view uses snake_case. This prevents drift.
 *
 * HOW:
 * Switch on the UI field name and read correct property. For account privacy,
 * prefer canonical string, fall back to boolean.
 */
function profileValueFor(fieldName, p) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!p) return '';
  // I am choosing among the named cases here so each supported value keeps its own clear path.
  switch (fieldName) {
    // This case marks the path for the matching value in the switch that started above.
    case 'displayName':        return p.display_name ?? '';
    // This case marks the path for the matching value in the switch that started above.
    case 'email':              return p.email ?? '';
    // This case marks the path for the matching value in the switch that started above.
    case 'phone':              return p.phone ?? '';
    // This case marks the path for the matching value in the switch that started above.
    case 'birthday':           return p.birthday ?? '';
    // This case marks the path for the matching value in the switch that started above.
    case 'gender':             return p.gender ?? '';
    // This case marks the path for the matching value in the switch that started above.
    case 'language':           return p.language ?? '';
    // This case marks the path for the matching value in the switch that started above.
    case 'cityProvince':       return p.city_province ?? '';
    // This case marks the path for the matching value in the switch that started above.
    case 'country':            return p.country ?? '';
    // This case marks the path for the matching value in the switch that started above.
    case 'profileTitle':       return p.profile_title ?? '';
    // This case marks the path for the matching value in the switch that started above.
    case 'profileDescription': return p.profile_description ?? '';
    // This case marks the path for the matching value in the switch that started above.
    case 'hobbies':            return p.hobbies ?? '';
    // This case marks the path for the matching value in the switch that started above.
    case 'music':              return p.music ?? '';
    // This case marks the path for the matching value in the switch that started above.
    case 'favFood':            return p.fav_food ?? '';
    // This case marks the path for the matching value in the switch that started above.
    case 'relationshipStatus': return p.relationship_status ?? '';
    // This case marks the path for the matching value in the switch that started above.
    case 'job':                return p.job ?? '';
    // This case marks the path for the matching value in the switch that started above.
    case 'accountPrivacy': {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (p.account_privacy === 'public' || p.account_privacy === 'private') return p.account_privacy;
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (typeof p.is_private === 'boolean') return p.is_private ? 'private' : 'public';
      // This return sends the completed value or response back to the code that called this function.
      return 'public';
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This case marks the path for the matching value in the switch that started above.
    default: return p[fieldName] ?? '';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Map a UI field name + current input value -> backend field + normalized value.
 *
 * WHY:
 * Server expects snake_case keys; accountPrivacy sends boolean is_private.
 *
 * HOW:
 * Switch with controlled transformations; default is pass-through.
 */
function backendFieldFor(fieldName, rawValue) {
  // I am choosing among the named cases here so each supported value keeps its own clear path.
  switch (fieldName) {
    // This case marks the path for the matching value in the switch that started above.
    case 'displayName':        return { field: 'display_name_override', value: rawValue ?? null };
    // This case marks the path for the matching value in the switch that started above.
    case 'cityProvince':       return { field: 'city_province',         value: rawValue ?? null };
    // This case marks the path for the matching value in the switch that started above.
    case 'profileTitle':       return { field: 'profile_title',         value: rawValue ?? null };
    // This case marks the path for the matching value in the switch that started above.
    case 'profileDescription': return { field: 'profile_description',   value: rawValue ?? null };
    // This case marks the path for the matching value in the switch that started above.
    case 'favFood':            return { field: 'fav_food',              value: rawValue ?? null };
    // This case marks the path for the matching value in the switch that started above.
    case 'relationshipStatus': return { field: 'relationship_status',   value: rawValue ?? null };
    // This case marks the path for the matching value in the switch that started above.
    case 'accountPrivacy': {
      // UI uses 'public'|'private' -> server expects boolean is_private
      const normalized = (rawValue === 'private');
      // This return sends the completed value or response back to the code that called this function.
      return { field: 'is_private', value: normalized };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This case marks the path for the matching value in the switch that started above.
    default:
      // This return sends the completed value or response back to the code that called this function.
      return { field: fieldName, value: (rawValue ?? null) };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/* ============================================================
   Boot
   ============================================================ */

/**
 * WHAT:
 * Initialize page: load profile and wire handlers.
 *
 * WHY:
 * Keep startup deterministic; avoid races with other modules.
 *
 * HOW:
 * Wait for DOMContentLoaded and proceed. This file does not require
 * the Supabase browser client; it talks to your server API.
 */
document.addEventListener('DOMContentLoaded', () => {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  log.info('Profile edit page loaded');
  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  loadUserProfile().then(() => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    attachEventHandlers();
    // Initialize password, delete-account, and visibility toggles AFTER profile loads
    initPasswordManager();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    initDeleteAccountFlow();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    initPasswordToggles();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
  // I am calling this helper here so the current workflow performs this step before it moves on.
  log.info('Profile edit page initialized - logout handled by logout.js module');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

/* ============================================================
   Data: load + render
   ============================================================ */

/**
 * Load user profile data from server API (canonical view)
 */
async function loadUserProfile() {
  // Load the server's canonical profile instead of trusting values embedded in the page;
  // this gives every editable field the same starting point.
  // profile.js scopes /api/profile/me to req.user and profileService returns its canonical view.
  try {
    // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
    const response = await fetch('/api/profile/me', {
      // I am keeping the `method` field in this object so the receiving code can read that value by its expected name.
      method: 'GET',
      // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
      credentials: 'include',
      // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
      headers: { 'Content-Type': 'application/json' }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!response.ok) {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (response.status === 401) throw new Error('Authentication required. Please login again.');
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw new Error(`Failed to load profile: ${response.status}`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
    const result = await response.json();
    // Keep one server-confirmed object as the source for read mode, edit defaults, and cancel.
    if (!result.success) throw new Error(result.message || 'Failed to load profile');

    // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
    userProfile = result.profile;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info('Profile data loaded', { user_id: userProfile?.id });

    // I am calling this helper here so the current workflow performs this step before it moves on.
    displayProfileData();
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.error('Failed to load user profile:', error);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    showError('Failed to load profile data. Please refresh the page.');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Display all fields in read mode using canonical mapping
 */
function displayProfileData() {
  // FIELD_ORDER keeps rendering stable and routes every value through the mapping helper above.
  if (!userProfile) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn('No user profile data available');
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // I am calling this helper here so the current workflow performs this step before it moves on.
  log.info('Displaying profile data', { user_id: userProfile.id });
  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  FIELD_ORDER.forEach((fn) => displayField(fn, profileValueFor(fn, userProfile)));
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Display a single field value in both the read label and the input
 */
function displayField(fieldName, value) {
  // I am saving `displayElement` here so the nearby steps can reuse the same value without rebuilding it each time.
  const displayElement = document.getElementById(`${fieldName}Display`);
  // I am saving `inputElement` here so the nearby steps can reuse the same value without rebuilding it each time.
  const inputElement   = document.getElementById(fieldName);

  // I am calling this helper here so the current workflow performs this step before it moves on.
  log.info(`Displaying field: ${fieldName}`);

  // Normalize account privacy string if needed
  if (fieldName === 'accountPrivacy') {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof value === 'boolean') value = value ? 'private' : 'public';
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (value !== 'public' && value !== 'private') {
      // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
      value = profileValueFor('accountPrivacy', userProfile);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (displayElement) {
    // I am saving `displayValue` here so the nearby steps can reuse the same value without rebuilding it each time.
    let displayValue = value;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (Array.isArray(value)) displayValue = value.length > 0 ? value.join(', ') : null;
    // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
    displayElement.textContent = (displayValue && `${displayValue}`.trim()) || 'Not provided';
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn(`Display element not found: ${fieldName}`);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (inputElement) {
    // I am saving `inputValue` here so the nearby steps can reuse the same value without rebuilding it each time.
    let inputValue = value;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (Array.isArray(value)) inputValue = value.length > 0 ? value.join(', ') : '';
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (inputElement.tagName === 'SELECT') {
      // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
      inputElement.value = inputValue || '';
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
      inputElement.value = inputValue || '';
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn(`Input element not found: ${fieldName}`);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/* ============================================================
   Handlers
   ============================================================ */

/**
 * Attach click handlers to each field's Edit/Save button
 */
function attachEventHandlers() {
  // These IDs match profile-edit.ejs; each button toggles Edit first and Save on its next click.
  const editButtons = [
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'editDisplayName', 'editPhone', 'editBirthday', 'editGender',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'editLanguage', 'editCityProvince', 'editCountry', 'editProfileTitle',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'editProfileDescription', 'editHobbies', 'editMusic', 'editFavFood',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'editRelationshipStatus', 'editJob', 'editAccountPrivacy'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  ];

  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  editButtons.forEach((buttonId) => {
    // I am saving `button` here so the nearby steps can reuse the same value without rebuilding it each time.
    const button = document.getElementById(buttonId);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!button) return log.warn(`Button not found: ${buttonId}`);

    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    button.addEventListener('click', () => {
      // I am saving `fieldName` here so the nearby steps can reuse the same value without rebuilding it each time.
      const fieldName = buttonId.replace('edit', '');
      // I am saving `camelCaseFieldName` here so the nearby steps can reuse the same value without rebuilding it each time.
      const camelCaseFieldName = fieldName.charAt(0).toLowerCase() + fieldName.slice(1);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.info(`Edit button clicked: ${camelCaseFieldName}`);

      // If saving is in progress for this field, ignore clicks
      if (savingFields.has(camelCaseFieldName)) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.warn('Save in progress; click ignored', { field: camelCaseFieldName });
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (editingFields.has(camelCaseFieldName)) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        saveIndividualField(camelCaseFieldName);
      // This alternative runs only when the condition above did not use its first path.
      } else {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        toggleFieldEdit(camelCaseFieldName);
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Toggle field between read and edit mode
 */
function toggleFieldEdit(fieldName) {
  // Keep display, input, button styling, editing set, and cancel action in one transition.
  const displayElement = document.getElementById(`${fieldName}Display`);
  // I am saving `inputElement` here so the nearby steps can reuse the same value without rebuilding it each time.
  const inputElement   = document.getElementById(fieldName);
  // I am saving `editButton` here so the nearby steps can reuse the same value without rebuilding it each time.
  const editButton     = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!displayElement || !inputElement || !editButton) return;

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (editingFields.has(fieldName)) {
    // Switch to read mode
    displayElement.classList.remove('field-display-hidden'); displayElement.classList.add('field-display-inline');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    inputElement.classList.add('field-input-hidden');        inputElement.classList.remove('field-input-inline');
    // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
    editButton.textContent = 'Edit';
    // I am calling this helper here so the current workflow performs this step before it moves on.
    editButton.classList.remove('btn-primary');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    editButton.classList.add('btn-small');
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    editingFields.delete(fieldName);
  // This alternative runs only when the condition above did not use its first path.
  } else {
    // Switch to edit mode (pre-fill with canonical value to avoid stale UI)
    inputElement.value = profileValueFor(fieldName, userProfile) || '';
    // I am calling this helper here so the current workflow performs this step before it moves on.
    displayElement.classList.add('field-display-hidden'); displayElement.classList.remove('field-display-inline');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    inputElement.classList.remove('field-input-hidden');  inputElement.classList.add('field-input-inline');
    // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
    editButton.textContent = 'Save';
    // I am calling this helper here so the current workflow performs this step before it moves on.
    editButton.classList.remove('btn-small');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    editButton.classList.add('btn-primary');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    editingFields.add(fieldName);

    // Add cancel button
    addCancelButton(fieldName);

    // Focus the input
    inputElement.focus();
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!userProfile) throw new Error('Profile not loaded');

    // I am saving `inputElement` here so the nearby steps can reuse the same value without rebuilding it each time.
    const inputElement = document.getElementById(fieldName);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!inputElement) throw new Error('Field not found');

    // I am saving `rawValue` here so the nearby steps can reuse the same value without rebuilding it each time.
    const rawValue = inputElement.value ?? null;

    // Validate first
    const validationError = validateField(fieldName);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (validationError) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      showFieldError(`${fieldName}Error`, validationError);
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    clearFieldError(`${fieldName}Error`);

    // Map to backend field/value
    const { field, value } = backendFieldFor(fieldName, rawValue);
    // validateProfileUpdate receives this backend key and builds the final safe patch.
    log.info(`Field mapping: ${fieldName} -> ${field}`);

    // CSRF token (required)
    const csrfToken = getCsrfTokenValue();
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.info('CSRF token check', { found: !!csrfToken });
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!csrfToken) throw new Error('CSRF token not found');

    // In-flight guard + button disable
    savingFields.add(fieldName);
    // I am saving `editButton` here so the nearby steps can reuse the same value without rebuilding it each time.
    const editButton = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (editButton) editButton.disabled = true;

    // Send update
    const response = await fetch('/api/profile/me', {
      // registerRoutes mounted requireAuth before profile.js, and CSRF middleware checks this header.
      method: 'PUT',
      // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
      credentials: 'include',
      // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
      headers: {
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Content-Type': 'application/json',
        // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
        'X-CSRF-Token': csrfToken
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
      body: JSON.stringify({ [field]: value })
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // Attempt to parse JSON error bodies safely
    if (!response.ok) {
      // I am saving `errorMsg` here so the nearby steps can reuse the same value without rebuilding it each time.
      let errorMsg = `Update failed: ${response.status}`;
      // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
      try {
        // I am saving `maybe` here so the nearby steps can reuse the same value without rebuilding it each time.
        const maybe = await response.json();
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (maybe && maybe.message) errorMsg = maybe.message;
      // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
      } catch {}
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw new Error(errorMsg);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
    const result = await response.json();
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!result.success) throw new Error(result.message || 'Update failed');

    // Update local profile with canonical server copy
    // This may include normalization performed across Auth metadata and the profiles table.
    userProfile = result.profile;

    // Switch field back to read mode
    const displayElement = document.getElementById(`${fieldName}Display`);
    // I am saving `inputEl` here so the nearby steps can reuse the same value without rebuilding it each time.
    const inputEl        = document.getElementById(fieldName);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (displayElement && inputEl && editButton) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      displayElement.classList.remove('field-display-hidden'); displayElement.classList.add('field-display-inline');
      // I am calling this helper here so the current workflow performs this step before it moves on.
      inputEl.classList.add('field-input-hidden');             inputEl.classList.remove('field-input-inline');
      // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
      editButton.textContent = 'Edit';
      // I am calling this helper here so the current workflow performs this step before it moves on.
      editButton.classList.remove('btn-primary');
      // I am calling this helper here so the current workflow performs this step before it moves on.
      editButton.classList.add('btn-small');
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      editingFields.delete(fieldName);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Remove cancel button
    const fieldContainer = editButton?.parentElement;
    // I am saving `cancelButton` here so the nearby steps can reuse the same value without rebuilding it each time.
    const cancelButton = fieldContainer?.querySelector('.cancel-btn');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (cancelButton) cancelButton.remove();

    // Re-render the single field with canonical value
    displayField(fieldName, profileValueFor(fieldName, userProfile));

    // UX message (no-change vs updated)
    if (result.unchanged === true) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      showInfo(`No changes made to ${getFieldDisplayName(fieldName)}`);
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      showSuccess(`${getFieldDisplayName(fieldName)} updated successfully!`);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.error(`Failed to save ${fieldName}:`, error);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    showFieldError(`${fieldName}Error`, `Failed to save: ${error.message}`);
  // This final block runs after success or failure so the shared cleanup still happens in either outcome.
  } finally {
    // Always clear in-flight guard and re-enable button
    savingFields.delete(fieldName);
    // I am saving `editButton` here so the nearby steps can reuse the same value without rebuilding it each time.
    const editButton = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (editButton) editButton.disabled = false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Add cancel button for field editing
 */
function addCancelButton(fieldName) {
  // I am saving `editButton` here so the nearby steps can reuse the same value without rebuilding it each time.
  const editButton = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);
  // I am saving `fieldContainer` here so the nearby steps can reuse the same value without rebuilding it each time.
  const fieldContainer = editButton?.parentElement;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!fieldContainer) return;

  // Already present?
  if (fieldContainer.querySelector('.cancel-btn')) return;

  // Create cancel button
  const cancelButton = document.createElement('button');
  // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
  cancelButton.type = 'button';
  // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
  cancelButton.className = 'btn btn-secondary cancel-btn';
  // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
  cancelButton.textContent = 'Cancel';

  // Handler
  cancelButton.addEventListener('click', () => cancelFieldEdit(fieldName));

  // Insert after edit button
  fieldContainer.insertBefore(cancelButton, editButton.nextSibling);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Cancel field edit and revert to canonical profile value
 */
function cancelFieldEdit(fieldName) {
  // I am saving `displayElement` here so the nearby steps can reuse the same value without rebuilding it each time.
  const displayElement = document.getElementById(`${fieldName}Display`);
  // I am saving `inputElement` here so the nearby steps can reuse the same value without rebuilding it each time.
  const inputElement   = document.getElementById(fieldName);
  // I am saving `editButton` here so the nearby steps can reuse the same value without rebuilding it each time.
  const editButton     = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);
  // I am saving `fieldContainer` here so the nearby steps can reuse the same value without rebuilding it each time.
  const fieldContainer = editButton?.parentElement;
  // I am saving `cancelButton` here so the nearby steps can reuse the same value without rebuilding it each time.
  const cancelButton   = fieldContainer?.querySelector('.cancel-btn');

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!displayElement || !inputElement || !editButton) return;

  // Revert input to canonical value
  const originalValue = profileValueFor(fieldName, userProfile);
  // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
  inputElement.value = originalValue;

  // Back to read mode
  displayElement.classList.remove('field-display-hidden'); displayElement.classList.add('field-display-inline');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  inputElement.classList.add('field-input-hidden');        inputElement.classList.remove('field-input-inline');
  // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
  editButton.textContent = 'Edit';
  // I am calling this helper here so the current workflow performs this step before it moves on.
  editButton.classList.remove('btn-primary');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  editButton.classList.add('btn-small');
  // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
  editingFields.delete(fieldName);

  // Remove cancel button
  if (cancelButton) cancelButton.remove();

  // Clear any errors
  clearFieldError(`${fieldName}Error`);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Get display name for field (for messages)
 */
function getFieldDisplayName(fieldName) {
  // I am saving `fieldNames` here so the nearby steps can reuse the same value without rebuilding it each time.
  const fieldNames = {
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'displayName': 'Display name',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'phone': 'Phone number',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'birthday': 'Birthday',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'gender': 'Gender',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'language': 'Language',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'cityProvince': 'City/Province',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'country': 'Country',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'profileTitle': 'Profile title',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'profileDescription': 'Profile description',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'hobbies': 'Hobbies',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'music': 'Music preferences',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'favFood': 'Favorite food',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'relationshipStatus': 'Relationship status',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'job': 'Job status',
    // I am listing this entry here because the surrounding collection processes each allowed value in order.
    'accountPrivacy': 'Account privacy'
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
  // This return sends the completed value or response back to the code that called this function.
  return fieldNames[fieldName] || fieldName;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/* ============================================================
   Validation (same behavior as before)
   ============================================================ */
// I am keeping `validateField` as a named helper so the surrounding workflow can call this step when it needs it.
function validateField(fieldName) {
  // I am saving `inputElement` here so the nearby steps can reuse the same value without rebuilding it each time.
  const inputElement = document.getElementById(fieldName);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!inputElement) return '';
  // I am saving `value` here so the nearby steps can reuse the same value without rebuilding it each time.
  const value = inputElement.value;

  // I am choosing among the named cases here so each supported value keeps its own clear path.
  switch (fieldName) {
    // This case marks the path for the matching value in the switch that started above.
    case 'displayName':         return validateDisplayName(value, 'Display name');
    // This case marks the path for the matching value in the switch that started above.
    case 'phone':               return validatePhone(value);
    // This case marks the path for the matching value in the switch that started above.
    case 'birthday':            return validateBirthday(value);
    // This case marks the path for the matching value in the switch that started above.
    case 'gender':              return validateGender(value);
    // This case marks the path for the matching value in the switch that started above.
    case 'relationshipStatus':  return validateRelationshipStatus(value);
    // This case marks the path for the matching value in the switch that started above.
    case 'job':                 return validateJobStatus(value);
    // This case marks the path for the matching value in the switch that started above.
    case 'accountPrivacy':      return validateAccountPrivacy(value);
    // This case marks the path for the matching value in the switch that started above.
    case 'language':            return validateLanguage(value);
    // This case marks the path for the matching value in the switch that started above.
    case 'cityProvince':        return validateCityProvince(value);
    // This case marks the path for the matching value in the switch that started above.
    case 'country':             return validateCountry(value);
    // This case marks the path for the matching value in the switch that started above.
    case 'profileTitle':        return validateProfileTitle(value);
    // This case marks the path for the matching value in the switch that started above.
    case 'profileDescription':  return validateProfileDescription(value);
    // This case marks the path for the matching value in the switch that started above.
    case 'hobbies':             return validateHobbies(value);
    // This case marks the path for the matching value in the switch that started above.
    case 'music':               return validateMusic(value);
    // This case marks the path for the matching value in the switch that started above.
    case 'favFood':             return validateFavFood(value);
    // This case marks the path for the matching value in the switch that started above.
    default:                    return '';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `_validateName` as a named helper so the surrounding workflow can call this step when it needs it.
function _validateName(value, fieldName) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value || value.trim().length === 0) return `${fieldName} is required`;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (value.length > 50) return `${fieldName} must be 50 characters or less`;
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateDisplayName` as a named helper so the surrounding workflow can call this step when it needs it.
function validateDisplayName(value, fieldName) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value || value.trim().length === 0) return `${fieldName} is required`;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (value.length > 100) return `${fieldName} must be 100 characters or less`;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (value.length < 2) return `${fieldName} must be at least 2 characters long`;
  // I am saving `validDisplayNameRegex` here so the nearby steps can reuse the same value without rebuilding it each time.
  const validDisplayNameRegex = /^[a-zA-Z0-9\s'-._]+$/;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!validDisplayNameRegex.test(value)) {
    // This return sends the completed value or response back to the code that called this function.
    return `${fieldName} can only contain letters, numbers, spaces, hyphens, apostrophes, periods, and underscores`;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validatePhone` as a named helper so the surrounding workflow can call this step when it needs it.
function validatePhone(value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value) return '';
  // I am saving `phoneRegex` here so the nearby steps can reuse the same value without rebuilding it each time.
  const phoneRegex = /^[\d\-\+\(\)\s]+$/;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!phoneRegex.test(value)) return 'Phone number contains invalid characters';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (value.length > 15) return 'Phone number must be 15 characters or less';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateBirthday` as a named helper so the surrounding workflow can call this step when it needs it.
function validateBirthday(value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value) return '';
  // I am saving `dateRegex` here so the nearby steps can reuse the same value without rebuilding it each time.
  const dateRegex = /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})$/;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!dateRegex.test(value)) return 'Birthday must be in MM/DD/YYYY or YYYY-MM-DD format';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateGender` as a named helper so the surrounding workflow can call this step when it needs it.
function validateGender(value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value) return '';
  // I am saving `validGenders` here so the nearby steps can reuse the same value without rebuilding it each time.
  const validGenders = ['male', 'female'];
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!validGenders.includes(value)) return 'Gender must be either male or female';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateRelationshipStatus` as a named helper so the surrounding workflow can call this step when it needs it.
function validateRelationshipStatus(value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value) return '';
  // I am saving `validStatuses` here so the nearby steps can reuse the same value without rebuilding it each time.
  const validStatuses = ['single', 'married'];
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!validStatuses.includes(value)) return 'Relationship status must be either single or married';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateJobStatus` as a named helper so the surrounding workflow can call this step when it needs it.
function validateJobStatus(value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value) return '';
  // I am saving `validStatuses` here so the nearby steps can reuse the same value without rebuilding it each time.
  const validStatuses = ['unemployed', 'employed'];
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!validStatuses.includes(value)) return 'Job status must be either unemployed or employed';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateAccountPrivacy` as a named helper so the surrounding workflow can call this step when it needs it.
function validateAccountPrivacy(value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value) return '';
  // I am saving `validPrivacy` here so the nearby steps can reuse the same value without rebuilding it each time.
  const validPrivacy = ['public', 'private'];
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!validPrivacy.includes(value)) return 'Account privacy must be either public or private';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateLanguage` as a named helper so the surrounding workflow can call this step when it needs it.
function validateLanguage(value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value) return '';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (value.length > 50) return 'Language must be 50 characters or less';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateCityProvince` as a named helper so the surrounding workflow can call this step when it needs it.
function validateCityProvince(value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value) return '';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (value.length > 100) return 'City/Province must be 100 characters or less';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateCountry` as a named helper so the surrounding workflow can call this step when it needs it.
function validateCountry(value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value) return '';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (value.length > 100) return 'Country must be 100 characters or less';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateProfileTitle` as a named helper so the surrounding workflow can call this step when it needs it.
function validateProfileTitle(value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value) return '';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (value.length > 140) return 'Profile title must be 140 characters or less';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateProfileDescription` as a named helper so the surrounding workflow can call this step when it needs it.
function validateProfileDescription(value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value) return '';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (value.length > 2000) return 'Profile description must be 2000 characters or less';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateHobbies` as a named helper so the surrounding workflow can call this step when it needs it.
function validateHobbies(value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value) return '';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (value.length > 200) return 'Hobbies must be 200 characters or less';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateMusic` as a named helper so the surrounding workflow can call this step when it needs it.
function validateMusic(value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value) return '';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (value.length > 200) return 'Music preferences must be 200 characters or less';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `validateFavFood` as a named helper so the surrounding workflow can call this step when it needs it.
function validateFavFood(value) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!value) return '';
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (value.length > 100) return 'Favorite food must be 100 characters or less';
  // This return sends the completed value or response back to the code that called this function.
  return '';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/* ============================================================
   UI helpers: error + toasts (CSP-friendly)
   ============================================================ */
// I am keeping `showFieldError` as a named helper so the surrounding workflow can call this step when it needs it.
function showFieldError(fieldId, message) {
  // I am saving `errorElement` here so the nearby steps can reuse the same value without rebuilding it each time.
  const errorElement = document.getElementById(fieldId);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (errorElement) {
    // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
    errorElement.textContent = message;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errorElement.classList.remove('hidden');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `clearFieldError` as a named helper so the surrounding workflow can call this step when it needs it.
function clearFieldError(fieldId) {
  // I am saving `errorElement` here so the nearby steps can reuse the same value without rebuilding it each time.
  const errorElement = document.getElementById(fieldId);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (errorElement) {
    // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
    errorElement.textContent = '';
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errorElement.classList.add('hidden');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `showError` as a named helper so the surrounding workflow can call this step when it needs it.
function showError(message) {
  // I am saving `errorElement` here so the nearby steps can reuse the same value without rebuilding it each time.
  const errorElement = document.getElementById('profileGeneralError');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (errorElement) {
    // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
    errorElement.textContent = message;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errorElement.classList.remove('hidden');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `showSuccess` as a named helper so the surrounding workflow can call this step when it needs it.
function showSuccess(message) {
  // I am saving `el` here so the nearby steps can reuse the same value without rebuilding it each time.
  const el = document.createElement('div');
  // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
  el.className = 'success-toast is-visible';
  // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
  el.textContent = message;
  // I am calling this helper here so the current workflow performs this step before it moves on.
  document.body.appendChild(el);
  // I am updating or clearing this saved state here so the interface reflects the result of the action above.
  setTimeout(() => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    el.classList.remove('is-visible');
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setTimeout(() => el.remove(), 300);
  // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
  }, 3000);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `showInfo` as a named helper so the surrounding workflow can call this step when it needs it.
function showInfo(message) {
  // I am saving `el` here so the nearby steps can reuse the same value without rebuilding it each time.
  const el = document.createElement('div');
  // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
  el.className = 'info-message info-toast is-visible';
  // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
  el.textContent = message;
  // I am calling this helper here so the current workflow performs this step before it moves on.
  document.body.appendChild(el);
  // I am updating or clearing this saved state here so the interface reflects the result of the action above.
  setTimeout(() => {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    el.classList.remove('is-visible');
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    setTimeout(() => el.remove(), 300);
  // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
  }, 3000);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/* ============================================================
   Password Manager
   ============================================================ */
// I am keeping `initPasswordManager` as a named helper so the surrounding workflow can call this step when it needs it.
function initPasswordManager() {
  // Password changes use a separate guarded flow because success invalidates the current
  // session and redirects, unlike an ordinary profile-field save.
  // Validation stays in this setup handler; submitPasswordChange owns the protected request.
  const toggleBtn = document.getElementById('passwordToggleBtn');
  // I am saving `fields` here so the nearby steps can reuse the same value without rebuilding it each time.
  const fields = document.getElementById('passwordFields');
  // I am saving `cancelBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
  const cancelBtn = document.getElementById('passwordCancelBtn');
  // I am saving `saveBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
  const saveBtn = document.getElementById('passwordSaveBtn');

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!toggleBtn) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn('Password toggle button not found');
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!fields) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn('Password fields container not found');
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!cancelBtn) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn('Password cancel button not found');
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!saveBtn) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn('Password save button not found');
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  toggleBtn.addEventListener('click', () => {
    // If saving is in progress, ignore clicks (consistent with Edit buttons)
    if (passwordSaving.has('password')) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.warn('Password save in progress; click ignored');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am calling this helper here so the current workflow performs this step before it moves on.
    toggleBtn.classList.add('hidden');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    fields.classList.remove('hidden');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  cancelBtn.addEventListener('click', () => {
    // If saving is in progress, ignore clicks (consistent with Edit buttons)
    if (passwordSaving.has('password')) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.warn('Password save in progress; cancel ignored');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am calling this helper here so the current workflow performs this step before it moves on.
    resetPasswordFields(fields, toggleBtn);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  saveBtn.addEventListener('click', () => {
    // If saving is in progress, ignore clicks (consistent with Edit buttons)
    if (passwordSaving.has('password')) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.warn('Password save in progress; click ignored');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Validate fields first
    const currentPassword = document.getElementById('currentPassword')?.value || '';
    // I am saving `newPassword` here so the nearby steps can reuse the same value without rebuilding it each time.
    const newPassword = document.getElementById('newPassword')?.value || '';
    // I am saving `confirmPassword` here so the nearby steps can reuse the same value without rebuilding it each time.
    const confirmPassword = document.getElementById('confirmPassword')?.value || '';

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!currentPassword || !newPassword || !confirmPassword) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      showPasswordError('All password fields are required');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (newPassword.length < 8) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      showPasswordError('New password must be at least 8 characters');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (newPassword.length > 50) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      showPasswordError('New password must be 50 characters or less');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (/\s/.test(newPassword)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      showPasswordError('Password cannot contain spaces');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `validPasswordRegex` here so the nearby steps can reuse the same value without rebuilding it each time.
    const validPasswordRegex = /^[a-zA-Z0-9]+$/;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!validPasswordRegex.test(newPassword)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      showPasswordError('Password can only contain uppercase letters, lowercase letters, and numbers');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!/[A-Z]/.test(newPassword)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      showPasswordError('Password must contain at least one capital letter');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!/[0-9]/.test(newPassword)) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      showPasswordError('Password must contain at least one number');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (newPassword !== confirmPassword) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      showPasswordError('New passwords do not match');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Wait for modalManager to be ready (loaded statically in template)
    whenModalManagerReady((modalManager) => {
      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (!modalManager || typeof modalManager.showPasswordChangeConfirm !== 'function') {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.warn('modalManager.showPasswordChangeConfirm not available, proceeding without confirmation');
        // I am calling this helper here so the current workflow performs this step before it moves on.
        submitPasswordChange(saveBtn, toggleBtn, fields);
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.info('Showing password change confirmation modal');
      // I am calling this helper here so the current workflow performs this step before it moves on.
      modalManager.showPasswordChangeConfirm(
        // I am defining this small callback here so the surrounding API can run it with the value it supplies.
        () => {
          // On cancel - just close modal, fields remain
          log.info('Password change cancelled by user');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        },
        // I am defining this small callback here so the surrounding API can run it with the value it supplies.
        () => {
          // On confirm - proceed with password change
          submitPasswordChange(saveBtn, toggleBtn, fields);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      );
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am calling this helper here so the current workflow performs this step before it moves on.
  log.info('Password manager initialized successfully');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `resetPasswordFields` as a named helper so the surrounding workflow can call this step when it needs it.
function resetPasswordFields(container, toggleBtn) {
  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  ['currentPassword', 'newPassword', 'confirmPassword'].forEach((id) => {
    // I am saving `input` here so the nearby steps can reuse the same value without rebuilding it each time.
    const input = document.getElementById(id);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (input) input.value = '';
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
  // I am calling this helper here so the current workflow performs this step before it moves on.
  showPasswordError('', true);
  // I am calling this helper here so the current workflow performs this step before it moves on.
  container.classList.add('hidden');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (toggleBtn) toggleBtn.classList.remove('hidden');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `showPasswordError` as a named helper so the surrounding workflow can call this step when it needs it.
function showPasswordError(message, hideOnly = false) {
  // I am saving `errorEl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const errorEl = document.getElementById('passwordError');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!errorEl) return;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (hideOnly || !message) {
    // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
    errorEl.textContent = '';
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errorEl.classList.add('hidden');
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
  errorEl.textContent = message;
  // I am calling this helper here so the current workflow performs this step before it moves on.
  errorEl.classList.remove('hidden');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `submitPasswordChange` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function submitPasswordChange(saveBtn, toggleBtn, container) {
  // /account/password verifies the current password, updates Supabase Auth, and clears session state.
  // In-flight guard (consistent with saveIndividualField pattern)
  if (passwordSaving.has('password')) return;

  // I am saving `currentPassword` here so the nearby steps can reuse the same value without rebuilding it each time.
  const currentPassword = document.getElementById('currentPassword')?.value || '';
  // I am saving `newPassword` here so the nearby steps can reuse the same value without rebuilding it each time.
  const newPassword = document.getElementById('newPassword')?.value || '';
  // I am saving `confirmPassword` here so the nearby steps can reuse the same value without rebuilding it each time.
  const confirmPassword = document.getElementById('confirmPassword')?.value || '';

  // I am saving `csrfToken` here so the nearby steps can reuse the same value without rebuilding it each time.
  const csrfToken = getCsrfTokenValue();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!csrfToken) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    showPasswordError('Missing security token. Please refresh and try again.');
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // In-flight guard + button disable (consistent with saveIndividualField pattern)
  passwordSaving.add('password');
  // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
  saveBtn.disabled = true;
  // I am calling this helper here so the current workflow performs this step before it moves on.
  showPasswordError('', true);

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // POST /account/password uses same CSRF pattern as PUT /api/profile/me:
    // - Send token in X-CSRF-Token header (required for JSON requests)
    // - Body _csrf is optional fallback, but header takes precedence
    const response = await fetch('/account/password', {
      // Send only JSON credentials and the request CSRF token to the protected account route.
      method: 'POST',
      // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
      credentials: 'include',
      // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
      headers: {
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Content-Type': 'application/json',
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Accept': 'application/json',
        // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
        'X-CSRF-Token': csrfToken
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      },
      // I am keeping the `body` field in this object so the receiving code can read that value by its expected name.
      body: JSON.stringify({
        // I am keeping the `current_password` field in this object so the receiving code can read that value by its expected name.
        current_password: currentPassword,
        // I am keeping the `new_password` field in this object so the receiving code can read that value by its expected name.
        new_password: newPassword,
        // I am keeping the `confirm_password` field in this object so the receiving code can read that value by its expected name.
        confirm_password: confirmPassword
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      })
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (response.redirected) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      window.location.replace(response.url);
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `payload` here so the nearby steps can reuse the same value without rebuilding it each time.
    const payload = await response.json().catch(() => null);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!response.ok) {
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw new Error(payload?.error || 'Password update failed');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Server already logged out and set redirect URL
    // Follow server redirect (no client-side logout needed)
    if (payload?.redirect) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      window.location.replace(payload.redirect);
    // This alternative runs only when the condition above did not use its first path.
    } else {
      // Fallback: redirect to login page with success flag
      window.location.replace('/login?password_changed_success=1');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.error('Password update failed', error);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    showPasswordError(error.message || 'Password update failed');
    // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
    passwordSaving.delete('password');
    // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
    saveBtn.disabled = false;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (toggleBtn && container) {
      // Keep fields visible for retry
      toggleBtn.classList.add('hidden');
      // I am calling this helper here so the current workflow performs this step before it moves on.
      container.classList.remove('hidden');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * WHAT:
 * Wait for modalManager to be ready before using it.
 *
 * WHY:
 * modalManager.js is loaded statically in the template, but there may be a brief
 * delay before it's fully initialized. This helper ensures we wait for it.
 *
 * HOW:
 * - Polls for window.modalManager with exponential backoff.
 * - Calls the callback once modalManager is available.
 * - Falls back gracefully if modalManager never becomes available.
 */
function whenModalManagerReady(cb, tries = 40) {
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (window.modalManager && typeof cb === 'function') {
    // This return sends the completed value or response back to the code that called this function.
    return cb(window.modalManager);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (tries <= 0) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn('[profile-edit] modalManager not available after retries');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (typeof cb === 'function') {
      cb(null); // Call with null to allow fallback handling
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // I am updating or clearing this saved state here so the interface reflects the result of the action above.
  setTimeout(() => whenModalManagerReady(cb, tries - 1), 50);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Password visibility toggles for password fields (shared pattern with login/register)
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
        // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
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

/* ============================================================
   Delete Account Modal
   ============================================================ */
// I am keeping `initDeleteAccountFlow` as a named helper so the surrounding workflow can call this step when it needs it.
function initDeleteAccountFlow() {
  // The two-step modal makes the destructive action deliberate, then locks its controls
  // while the server request is running so it cannot be submitted twice.
  // All modal exits check the same deleteAccountSaving set used by submitDeleteAccount.
  const trigger = document.getElementById('deleteAccountBtn');
  // I am saving `modal` here so the nearby steps can reuse the same value without rebuilding it each time.
  const modal = document.getElementById('deleteAccountModal');
  // I am saving `confirmBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
  const confirmBtn = document.getElementById('deleteAccountConfirmBtn');

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!trigger) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn('Delete account trigger button not found');
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!modal) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn('Delete account modal not found');
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!confirmBtn) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.warn('Delete account confirm button not found');
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  trigger.addEventListener('click', () => {
    // If deletion is in progress, ignore clicks (consistent with Edit buttons)
    if (deleteAccountSaving.has('delete')) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.warn('Delete account in progress; click ignored');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am calling this helper here so the current workflow performs this step before it moves on.
    openDeleteModal(modal);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am finding the existing page element here so the following browser code can read or update that confirmed DOM target.
  modal.querySelectorAll('[data-delete-close]').forEach((btn) => {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    btn.addEventListener('click', () => {
      // If deletion is in progress, ignore clicks (consistent with Edit buttons)
      if (deleteAccountSaving.has('delete')) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.warn('Delete account in progress; close ignored');
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // I am calling this helper here so the current workflow performs this step before it moves on.
      closeDeleteModal(modal);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am saving `cancelButtons` here so the nearby steps can reuse the same value without rebuilding it each time.
  const cancelButtons = modal.querySelectorAll('[data-delete-cancel]');
  // I am defining this small callback here so the surrounding API can run it with the value it supplies.
  cancelButtons.forEach((btn) => {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    btn.addEventListener('click', () => {
      // If deletion is in progress, ignore clicks (consistent with Edit buttons)
      if (deleteAccountSaving.has('delete')) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.warn('Delete account in progress; cancel ignored');
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // I am calling this helper here so the current workflow performs this step before it moves on.
      closeDeleteModal(modal);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am saving `continueBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
  const continueBtn = modal.querySelector('[data-delete-continue]');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (continueBtn) {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    continueBtn.addEventListener('click', () => {
      // If deletion is in progress, ignore clicks (consistent with Edit buttons)
      if (deleteAccountSaving.has('delete')) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.warn('Delete account in progress; continue ignored');
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // I am calling this helper here so the current workflow performs this step before it moves on.
      changeDeleteStep(modal, 'final');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `backBtn` here so the nearby steps can reuse the same value without rebuilding it each time.
  const backBtn = modal.querySelector('[data-delete-back]');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (backBtn) {
    // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
    backBtn.addEventListener('click', () => {
      // If deletion is in progress, ignore clicks (consistent with Edit buttons)
      if (deleteAccountSaving.has('delete')) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.warn('Delete account in progress; back ignored');
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // I am calling this helper here so the current workflow performs this step before it moves on.
      changeDeleteStep(modal, 'cancelled');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  confirmBtn.addEventListener('click', () => {
    // If deletion is in progress, ignore clicks (consistent with Edit buttons)
    if (deleteAccountSaving.has('delete')) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      log.warn('Delete account in progress; click ignored');
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am calling this helper here so the current workflow performs this step before it moves on.
    submitDeleteAccount(confirmBtn, modal);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am connecting this event listener here so the browser can run the nearby handler when that user or page event occurs.
  modal.addEventListener('click', (event) => {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (event.target === modal) {
      // If deletion is in progress, ignore clicks (consistent with Edit buttons)
      if (deleteAccountSaving.has('delete')) {
        // I am calling this helper here so the current workflow performs this step before it moves on.
        log.warn('Delete account in progress; modal close ignored');
        // This return sends the completed value or response back to the code that called this function.
        return;
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
      // I am calling this helper here so the current workflow performs this step before it moves on.
      closeDeleteModal(modal);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // I am calling this helper here so the current workflow performs this step before it moves on.
  log.info('Delete account flow initialized successfully');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `openDeleteModal` as a named helper so the surrounding workflow can call this step when it needs it.
function openDeleteModal(modal) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  changeDeleteStep(modal, 'confirm');
  // I am updating or clearing this saved state here so the interface reflects the result of the action above.
  clearDeleteAccountError();
  // I am calling this helper here so the current workflow performs this step before it moves on.
  modal.classList.add('show');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `closeDeleteModal` as a named helper so the surrounding workflow can call this step when it needs it.
function closeDeleteModal(modal) {
  // I am calling this helper here so the current workflow performs this step before it moves on.
  modal.classList.remove('show');
  // I am calling this helper here so the current workflow performs this step before it moves on.
  changeDeleteStep(modal, 'confirm');
  // I am updating or clearing this saved state here so the interface reflects the result of the action above.
  clearDeleteAccountError();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `changeDeleteStep` as a named helper so the surrounding workflow can call this step when it needs it.
function changeDeleteStep(modal, step) {
  // I am finding the existing page element here so the following browser code can read or update that confirmed DOM target.
  modal.querySelectorAll('.delete-step').forEach((section) => {
    // I am saving `desired` here so the nearby steps can reuse the same value without rebuilding it each time.
    const desired = section.getAttribute('data-delete-step');
    // I am calling this helper here so the current workflow performs this step before it moves on.
    section.classList.toggle('hidden', desired !== step);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `clearDeleteAccountError` as a named helper so the surrounding workflow can call this step when it needs it.
function clearDeleteAccountError() {
  // I am saving `errorEl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const errorEl = document.getElementById('deleteAccountError');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (errorEl) {
    // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
    errorEl.textContent = '';
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errorEl.classList.add('hidden');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `showDeleteAccountError` as a named helper so the surrounding workflow can call this step when it needs it.
function showDeleteAccountError(message) {
  // I am saving `errorEl` here so the nearby steps can reuse the same value without rebuilding it each time.
  const errorEl = document.getElementById('deleteAccountError');
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!errorEl) return;
  // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
  errorEl.textContent = message;
  // I am calling this helper here so the current workflow performs this step before it moves on.
  errorEl.classList.remove('hidden');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am keeping `submitDeleteAccount` as a named asynchronous helper so the surrounding workflow can call this step when it needs it.
async function submitDeleteAccount(button, modal) {
  // The account route performs the destructive server work; this page redirects only on success.
  // In-flight guard (consistent with saveIndividualField pattern)
  if (deleteAccountSaving.has('delete')) return;

  // I am saving `csrfToken` here so the nearby steps can reuse the same value without rebuilding it each time.
  const csrfToken = getCsrfTokenValue();
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!csrfToken) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    showDeleteAccountError('Missing security token. Please refresh and try again.');
    // This return sends the completed value or response back to the code that called this function.
    return;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // In-flight guard + button disable (consistent with saveIndividualField pattern)
  deleteAccountSaving.add('delete');
  // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
  button.disabled = true;
  // I am updating or clearing this saved state here so the interface reflects the result of the action above.
  clearDeleteAccountError();

  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `response` here so the nearby steps can reuse the same value without rebuilding it each time.
    const response = await fetch('/account/delete', {
      // Authentication comes from the HttpOnly cookie and CSRF proves this page initiated the POST.
      method: 'POST',
      // I am keeping the `credentials` field in this object so the receiving code can read that value by its expected name.
      credentials: 'include',
      // I am keeping the `headers` field in this object so the receiving code can read that value by its expected name.
      headers: {
        // I am listing this entry here because the surrounding collection processes each allowed value in order.
        'Accept': 'application/json',
        // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
        'X-CSRF-Token': csrfToken
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (response.redirected) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      window.location.replace(response.url);
      // This return sends the completed value or response back to the code that called this function.
      return;
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `payload` here so the nearby steps can reuse the same value without rebuilding it each time.
    const payload = await response.json().catch(() => null);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!response.ok) {
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw new Error(payload?.error || 'Account deletion failed');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am calling this helper here so the current workflow performs this step before it moves on.
    window.location.replace('/?account_deleted=1');
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    log.error('Account deletion failed', error);
    // I am calling this helper here so the current workflow performs this step before it moves on.
    showDeleteAccountError(error.message || 'Account deletion failed');
  // This final block runs after success or failure so the shared cleanup still happens in either outcome.
  } finally {
    // Always clear in-flight guard and re-enable button (consistent with saveIndividualField pattern)
    deleteAccountSaving.delete('delete');
    // I am keeping this line here because the surrounding profile-edit.js workflow expects this value or operation before it continues.
    button.disabled = false;
    // I am calling this helper here so the current workflow performs this step before it moves on.
    modal.classList.add('show');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// Logout functionality is handled by the modular logout.js system