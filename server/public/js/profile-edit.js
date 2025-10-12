/**
 * File: server/public/js/profile-edit.js
 * Description: Client-side JavaScript for user profile edit page
 * Purpose: Handles profile editing with read/edit mode toggle
 * Notes: Uses Supabase for user data management
 */

// Quiet console logger with dev toggle and PII-safe redaction
const logger = {
    // Check if debug mode is enabled via localStorage
    isDebugEnabled: () => localStorage.getItem('debugProfile') === '1',
    
    // Redact PII from objects and strings
    redact: (obj) => {
        if (typeof obj === 'string') {
            return obj.replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '[EMAIL]')
                     .replace(/(\b\d{7,}\b)/g, '[PHONE]')
                     .replace(/(sb-access-token=[^;]+)/g, '[TOKEN]');
        }
        if (typeof obj === 'object' && obj !== null) {
            const redacted = {};
            for (const [key, value] of Object.entries(obj)) {
                if (['email', 'phone', 'token', 'password', 'auth'].some(pii => key.toLowerCase().includes(pii))) {
                    redacted[key] = '[REDACTED]';
                } else if (typeof value === 'string') {
                    redacted[key] = logger.redact(value);
                } else {
                    redacted[key] = value;
                }
            }
            return redacted;
        }
        return obj;
    },
    
    // Gated logging functions
    info: (message, data = {}) => {
        if (logger.isDebugEnabled()) {
            try {
                console.log(`[DEBUG] ${message}`, logger.redact(data));
            } catch (e) {
                console.log(`[DEBUG] ${message}`, '[Logger error - data not logged]');
            }
        }
    },
    
    error: (message, data = {}) => {
        try {
            console.error(`[ERROR] ${message}`, logger.redact(data));
        } catch (e) {
            console.error(`[ERROR] ${message}`, '[Logger error - data not logged]');
        }
    },
    
    warn: (message, data = {}) => {
        if (logger.isDebugEnabled()) {
            try {
                console.warn(`[WARN] ${message}`, logger.redact(data));
            } catch (e) {
                console.warn(`[WARN] ${message}`, '[Logger error - data not logged]');
            }
        }
    }
};

// Global variables
let supabase = null;
let userProfile = null;
let editingFields = new Set();

/**
 * Initialize the profile edit page
 * 
 * WHAT:
 * We set up the page, initialize Supabase, load user profile data,
 * and attach event handlers for edit/save/cancel functionality.
 * 
 * WHY:
 * Users need to be able to view and edit their profile information
 * in a user-friendly way with read/edit mode toggles.
 * 
 * HOW:
 * 1. Initialize Supabase client
 * 2. Load user profile data from Supabase
 * 3. Display data in read mode
 * 4. Attach event handlers for edit buttons
 * 5. Handle form submission and validation
 */
document.addEventListener('DOMContentLoaded', function() {
    logger.info('Profile edit page loaded');
    
    // Initialize Supabase
    initializeSupabase();
    
    // Load user profile data
    loadUserProfile();
    
    // Attach event handlers
    attachEventHandlers();
    
    // Logout functionality is handled by logout.js module
    logger.info('Profile edit page initialized - logout handled by logout.js module');
});

/**
 * Initialize Supabase client
 */
function initializeSupabase() {
    try {
        const config = document.getElementById('app-config');
        const supabaseUrl = config.dataset.supabaseUrl;
        const supabaseAnonKey = config.dataset.supabaseAnonKey;
        
        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error('Supabase configuration missing');
        }
        
        supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
        logger.info('Supabase client initialized');
    } catch (error) {
        logger.error('Failed to initialize Supabase:', error);
        showError('Failed to initialize authentication system. Please refresh the page.');
    }
}

/**
 * Load user profile data from server API
 */
async function loadUserProfile() {
    try {
        // Get profile data from server API (uses v_profiles_full)
        const response = await fetch('/api/profile/me', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Authentication required. Please login again.');
            }
            throw new Error(`Failed to load profile: ${response.status}`);
        }
        
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Failed to load profile');
        }
        
        userProfile = result.profile;
        logger.info('Profile data loaded', { user_id: userProfile?.id });
        
        // Display profile data
        displayProfileData();
        
    } catch (error) {
        logger.error('Failed to load user profile:', error);
        showError('Failed to load profile data. Please refresh the page.');
    }
}

/**
 * Display profile data in read mode
 */
function displayProfileData() {
    if (!userProfile) {
        logger.warn('No user profile data available');
        return;
    }
    
    logger.info('Displaying profile data', { user_id: userProfile.id });
    
    // Display all fields using correct field names from v_profiles_full
    displayField('displayName', userProfile.display_name);
    displayField('email', userProfile.email);
    displayField('phone', userProfile.phone || 'Not provided');
    displayField('birthday', userProfile.birthday || 'Not provided');
    displayField('gender', userProfile.gender || 'Not specified');
    displayField('language', userProfile.language || 'English');
    displayField('cityProvince', userProfile.city_province || 'Not provided');
    displayField('country', userProfile.country || 'Not provided');
    displayField('profileTitle', userProfile.profile_title || 'Not provided');
    displayField('profileDescription', userProfile.profile_description || 'Not provided');
    displayField('hobbies', userProfile.hobbies || 'Not provided');
    displayField('music', userProfile.music || 'Not provided');
    displayField('favFood', userProfile.fav_food || 'Not provided');
    displayField('relationshipStatus', userProfile.relationship_status || 'Not specified');
    displayField('job', userProfile.job || 'Not specified');
    displayField('accountPrivacy', userProfile.account_privacy || 'public');
}

/**
 * Display a field value
 */
function displayField(fieldName, value) {
    const displayElement = document.getElementById(`${fieldName}Display`);
    const inputElement = document.getElementById(fieldName);
    
    logger.info(`Displaying field: ${fieldName}`);
    
    if (displayElement) {
        // Handle arrays (convert to string or show "Not provided")
        let displayValue = value;
        if (Array.isArray(value)) {
            displayValue = value.length > 0 ? value.join(', ') : null;
        }
        displayElement.textContent = displayValue || 'Not provided';
    } else {
        logger.warn(`Display element not found: ${fieldName}`);
    }
    
    if (inputElement) {
        // Handle arrays (convert to string for input fields)
        let inputValue = value;
        if (Array.isArray(value)) {
            inputValue = value.length > 0 ? value.join(', ') : '';
        }
        
        if (inputElement.tagName === 'SELECT') {
            inputElement.value = inputValue || '';
        } else {
            inputElement.value = inputValue || '';
        }
    } else {
        logger.warn(`Input element not found: ${fieldName}`);
    }
}

/**
 * Attach event handlers
 */
function attachEventHandlers() {
    // Attach edit button handlers for each field
    const editButtons = [
        'editDisplayName', 'editPhone', 'editBirthday', 'editGender',
        'editLanguage', 'editCityProvince', 'editCountry', 'editProfileTitle',
        'editProfileDescription', 'editHobbies', 'editMusic', 'editFavFood',
        'editRelationshipStatus', 'editJob', 'editAccountPrivacy'
    ];
    
    editButtons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) {
            // Event handler attached silently
            button.addEventListener('click', () => {
                // Convert buttonId like 'editDisplayName' to 'displayName'
                const fieldName = buttonId.replace('edit', '');
                // Convert first letter to lowercase: 'DisplayName' -> 'displayName'
                const camelCaseFieldName = fieldName.charAt(0).toLowerCase() + fieldName.slice(1);
                logger.info(`Edit button clicked: ${camelCaseFieldName}`);
                
                // Check if field is currently in edit mode
                if (editingFields.has(camelCaseFieldName)) {
                    // Save the field
                    logger.info(`Saving field: ${camelCaseFieldName}`);
                    saveIndividualField(camelCaseFieldName);
                } else {
                    // Switch to edit mode
                    logger.info(`Switching to edit mode: ${camelCaseFieldName}`);
                    toggleFieldEdit(camelCaseFieldName);
                }
            });
        } else {
            logger.warn(`Button not found: ${buttonId}`);
        }
    });
    
    // Save All and Cancel All buttons removed - using individual field saves only
    
    // Attach logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

/**
 * Toggle field between read and edit mode
 */
function toggleFieldEdit(fieldName) {
    const displayElement = document.getElementById(`${fieldName}Display`);
    const inputElement = document.getElementById(fieldName);
    const editButton = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);
    
    if (!displayElement || !inputElement || !editButton) return;
    
    if (editingFields.has(fieldName)) {
        // Switch to read mode
        displayElement.classList.remove('field-display-hidden'); displayElement.classList.add('field-display-inline');
        inputElement.classList.add('field-input-hidden'); inputElement.classList.remove('field-input-inline');
        editButton.textContent = 'Edit';
        editButton.classList.remove('btn-primary');
        editButton.classList.add('btn-small');
        editingFields.delete(fieldName);
    } else {
        // Switch to edit mode
        displayElement.classList.add('field-display-hidden'); displayElement.classList.remove('field-display-inline');
        inputElement.classList.remove('field-input-hidden'); inputElement.classList.add('field-input-inline');
        editButton.textContent = 'Save';
        editButton.classList.remove('btn-small');
        editButton.classList.add('btn-primary');
        editingFields.add(fieldName);
        
        // Add cancel button
        addCancelButton(fieldName);
        
        // Focus the input
        inputElement.focus();
    }
    
    // Individual field saves only - no global action buttons needed
}

/**
 * Save individual field
 */
async function saveIndividualField(fieldName) {
    try {
        if (!userProfile) {
            throw new Error('Profile not loaded');
        }
        
        const inputElement = document.getElementById(fieldName);
        if (!inputElement) {
            throw new Error('Field not found');
        }
        
        const value = inputElement.value || null;
        
        // Validate the field
        const error = validateField(fieldName);
        if (error) {
            showFieldError(`${fieldName}Error`, error);
            return;
        }
        
        // Clear any previous errors
        clearFieldError(`${fieldName}Error`);
        
        // Map frontend field name to backend field name
        let backendFieldName = fieldName;
        switch (fieldName) {
            case 'displayName':
                backendFieldName = 'display_name_override';
                break;
            case 'cityProvince':
                backendFieldName = 'city_province';
                break;
            case 'profileTitle':
                backendFieldName = 'profile_title';
                break;
            case 'profileDescription':
                backendFieldName = 'profile_description';
                break;
            case 'favFood':
                backendFieldName = 'fav_food';
                break;
            case 'relationshipStatus':
                backendFieldName = 'relationship_status';
                break;
        }
        
        logger.info(`Field mapping: ${fieldName} -> ${backendFieldName}`);
        
        // Prepare update data
        const updateData = { [backendFieldName]: value };
        logger.info('Sending update data', updateData);
        
        // Get CSRF token from the form
        const csrfToken = document.querySelector('input[name="_csrf"]')?.value;
        logger.info('CSRF token check', { found: !!csrfToken });
        if (!csrfToken) {
            throw new Error('CSRF token not found');
        }
        
        // Send update to server API
        const response = await fetch('/api/profile/me', {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify(updateData)
        });
        
        if (!response.ok) {
            const errorResult = await response.json();
            throw new Error(errorResult.message || `Update failed: ${response.status}`);
        }
        
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.message || 'Update failed');
        }
        
        // Update local profile data
        userProfile = result.profile;
        
        // Switch field back to read mode
        const saveDisplayElement = document.getElementById(`${fieldName}Display`);
        const saveInputElement = document.getElementById(fieldName);
        const saveEditButton = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);
        const saveFieldContainer = saveEditButton.parentElement;
        const saveCancelButton = saveFieldContainer.querySelector('.cancel-btn');
        
        if (saveDisplayElement && saveInputElement && saveEditButton) {
            saveDisplayElement.classList.remove('field-display-hidden'); saveDisplayElement.classList.add('field-display-inline');
            saveInputElement.classList.add('field-input-hidden'); saveInputElement.classList.remove('field-input-inline');
            saveEditButton.textContent = 'Edit';
            saveEditButton.classList.remove('btn-primary');
            saveEditButton.classList.add('btn-small');
            editingFields.delete(fieldName);
        }
        
        // Remove cancel button
        if (saveCancelButton) {
            saveCancelButton.remove();
        }
        
        // Update the display value
        displayField(fieldName, value || 'Not provided');
        
        // Show success message
        showSuccess(`${getFieldDisplayName(fieldName)} updated successfully!`);
        
    } catch (error) {
        logger.error(`Failed to save ${fieldName}:`, error);
        showFieldError(`${fieldName}Error`, `Failed to save: ${error.message}`);
    }
}

/**
 * Add cancel button for field editing
 */
function addCancelButton(fieldName) {
    const editButton = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);
    const fieldContainer = editButton.parentElement;
    
    // Check if cancel button already exists
    if (fieldContainer.querySelector('.cancel-btn')) {
        return;
    }
    
    // Create cancel button
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn btn-secondary cancel-btn';
    cancelButton.textContent = 'Cancel';
    
    // Add click handler
    cancelButton.addEventListener('click', () => {
        cancelFieldEdit(fieldName);
    });
    
    // Insert after edit button
    fieldContainer.insertBefore(cancelButton, editButton.nextSibling);
}

/**
 * Cancel field edit and revert changes
 */
function cancelFieldEdit(fieldName) {
    const displayElement = document.getElementById(`${fieldName}Display`);
    const inputElement = document.getElementById(fieldName);
    const editButton = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);
    const fieldContainer = editButton.parentElement;
    const cancelButton = fieldContainer.querySelector('.cancel-btn');
    
    if (!displayElement || !inputElement || !editButton) return;
    
    // Revert input value to original
    const originalValue = userProfile[fieldName] || '';
    inputElement.value = originalValue;
    
    // Switch back to read mode
    displayElement.classList.remove('field-display-hidden'); displayElement.classList.add('field-display-inline');
    inputElement.classList.add('field-input-hidden'); inputElement.classList.remove('field-input-inline');
    editButton.textContent = 'Edit';
    editButton.classList.remove('btn-primary');
    editButton.classList.add('btn-small');
    editingFields.delete(fieldName);
    
    // Remove cancel button
    if (cancelButton) {
        cancelButton.remove();
    }
    
    // Clear any errors
    clearFieldError(`${fieldName}Error`);
}

/**
 * Get display name for field (for success messages)
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

// updateFormActions function removed - no longer needed without Save All/Cancel All buttons

// Save All Changes and Cancel All Changes functions removed
// Using individual field saves only for better user experience and data integrity

/**
 * Validate a field
 */
function validateField(fieldName) {
    const inputElement = document.getElementById(fieldName);
    if (!inputElement) return '';
    
    const value = inputElement.value;
    
    switch (fieldName) {
        case 'displayName':
            return validateDisplayName(value, 'Display name');
        case 'phone':
            return validatePhone(value);
        case 'birthday':
            return validateBirthday(value);
        case 'gender':
            return validateGender(value);
        case 'relationshipStatus':
            return validateRelationshipStatus(value);
        case 'job':
            return validateJobStatus(value);
        case 'accountPrivacy':
            return validateAccountPrivacy(value);
        case 'language':
            return validateLanguage(value);
        case 'cityProvince':
            return validateCityProvince(value);
        case 'country':
            return validateCountry(value);
        case 'profileTitle':
            return validateProfileTitle(value);
        case 'profileDescription':
            return validateProfileDescription(value);
        case 'hobbies':
            return validateHobbies(value);
        case 'music':
            return validateMusic(value);
        case 'favFood':
            return validateFavFood(value);
        default:
            return '';
    }
}

/**
 * Validation functions
 */
function validateName(value, fieldName) {
    if (!value || value.trim().length === 0) {
        return `${fieldName} is required`;
    }
    if (value.length > 50) {
        return `${fieldName} must be 50 characters or less`;
    }
    return '';
}

function validateDisplayName(value, fieldName) {
    if (!value || value.trim().length === 0) {
        return `${fieldName} is required`;
    }
    if (value.length > 100) {
        return `${fieldName} must be 100 characters or less`;
    }
    if (value.length < 2) {
        return `${fieldName} must be at least 2 characters long`;
    }
    const validDisplayNameRegex = /^[a-zA-Z0-9\s'-._]+$/;
    if (!validDisplayNameRegex.test(value)) {
        return `${fieldName} can only contain letters, numbers, spaces, hyphens, apostrophes, periods, and underscores`;
    }
    return '';
}

function validatePhone(value) {
    if (!value) return '';
    const phoneRegex = /^[\d\-\+\(\)\s]+$/;
    if (!phoneRegex.test(value)) {
        return 'Phone number contains invalid characters';
    }
    if (value.length > 15) {
        return 'Phone number must be 15 characters or less';
    }
    return '';
}

function validateBirthday(value) {
    if (!value) return '';
    // Accept both MM/DD/YYYY and YYYY-MM-DD formats
    const dateRegex = /^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})$/;
    if (!dateRegex.test(value)) {
        return 'Birthday must be in MM/DD/YYYY or YYYY-MM-DD format';
    }
    return '';
}

function validateGender(value) {
    if (!value) return '';
    const validGenders = ['male', 'female'];
    if (!validGenders.includes(value)) {
        return 'Gender must be either male or female';
    }
    return '';
}

function validateRelationshipStatus(value) {
    if (!value) return '';
    const validStatuses = ['single', 'married'];
    if (!validStatuses.includes(value)) {
        return 'Relationship status must be either single or married';
    }
    return '';
}

function validateJobStatus(value) {
    if (!value) return '';
    const validStatuses = ['unemployed', 'employed'];
    if (!validStatuses.includes(value)) {
        return 'Job status must be either unemployed or employed';
    }
    return '';
}

function validateAccountPrivacy(value) {
    if (!value) return '';
    const validPrivacy = ['public', 'private'];
    if (!validPrivacy.includes(value)) {
        return 'Account privacy must be either public or private';
    }
    return '';
}

function validateLanguage(value) {
    if (!value) return '';
    if (value.length > 50) {
        return 'Language must be 50 characters or less';
    }
    return '';
}

function validateCityProvince(value) {
    if (!value) return '';
    if (value.length > 100) {
        return 'City/Province must be 100 characters or less';
    }
    return '';
}

function validateCountry(value) {
    if (!value) return '';
    if (value.length > 100) {
        return 'Country must be 100 characters or less';
    }
    return '';
}

function validateProfileTitle(value) {
    if (!value) return '';
    if (value.length > 140) {
        return 'Profile title must be 140 characters or less';
    }
    return '';
}

function validateProfileDescription(value) {
    if (!value) return '';
    if (value.length > 2000) {
        return 'Profile description must be 2000 characters or less';
    }
    return '';
}

function validateHobbies(value) {
    if (!value) return '';
    if (value.length > 200) {
        return 'Hobbies must be 200 characters or less';
    }
    return '';
}

function validateMusic(value) {
    if (!value) return '';
    if (value.length > 200) {
        return 'Music preferences must be 200 characters or less';
    }
    return '';
}

function validateFavFood(value) {
    if (!value) return '';
    if (value.length > 100) {
        return 'Favorite food must be 100 characters or less';
    }
    return '';
}

/**
 * Show field error
 */
function showFieldError(fieldId, message) {
    const errorElement = document.getElementById(fieldId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
    }
}

/**
 * Clear field error
 */
function clearFieldError(fieldId) {
    const errorElement = document.getElementById(fieldId);
    if (errorElement) {
        errorElement.textContent = '';
        errorElement.classList.add('hidden');
    }
}

/**
 * Show error message
 */
function showError(message) {
    const errorElement = document.getElementById('profileGeneralError');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.remove('hidden');
    }
}

/**
 * Show success message
 */
function showSuccess(message) {
    // CSP-friendly toast (styled via CSS)
    const el = document.createElement('div');
    el.className = 'success-message success-toast is-visible';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => {
        el.classList.remove('is-visible');
        setTimeout(() => el.remove(), 300); // allow fade-out
    }, 3000);
}

// Logout functionality is now handled by the modular logout.js system
