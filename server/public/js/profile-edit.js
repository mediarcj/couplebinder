/**
 * File: server/public/js/profile-edit.js
 * Description: Client-side JavaScript for user profile edit page
 * Purpose: Handles profile editing with read/edit mode toggle
 * Notes: Uses Supabase for user data management
 */

// Initialize logger
const logger = {
    info: (message, data = {}) => console.log(`[INFO] ${message}`, data),
    error: (message, data = {}) => console.error(`[ERROR] ${message}`, data),
    warn: (message, data = {}) => console.warn(`[WARN] ${message}`, data)
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
 * Load user profile data from Supabase
 */
async function loadUserProfile() {
    try {
        if (!supabase) {
            throw new Error('Supabase not initialized');
        }
        
        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            throw new Error('User not authenticated');
        }
        
        // Get user profile data from Supabase Auth user metadata
        userProfile = {
            id: user.id,
            email: user.email,
            display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || 'User',
            phone: user.phone || user.user_metadata?.phone || '',
            birthday: user.user_metadata?.birthday || '',
            gender: user.user_metadata?.gender || '',
            language: user.user_metadata?.language || 'English',
            city_province: user.user_metadata?.city_province || '',
            country: user.user_metadata?.country || '',
            profile_title: user.user_metadata?.profile_title || '',
            profile_description: user.user_metadata?.profile_description || '',
            hobbies: user.user_metadata?.hobbies || '',
            music: user.user_metadata?.music || '',
            fav_food: user.user_metadata?.fav_food || '',
            relationship_status: user.user_metadata?.relationship_status || '',
            job: user.user_metadata?.job || '',
            account_privacy: user.user_metadata?.account_privacy || 'public'
        };
        
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
    if (!userProfile) return;
    
    // Display all fields
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
    
    if (displayElement) {
        displayElement.textContent = value || 'Not provided';
    }
    
    if (inputElement) {
        if (inputElement.tagName === 'SELECT') {
            inputElement.value = value || '';
        } else {
            inputElement.value = value || '';
        }
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
            button.addEventListener('click', () => {
                const fieldName = buttonId.replace('edit', '').toLowerCase();
                toggleFieldEdit(fieldName);
            });
        }
    });
    
    // Attach save all button
    const saveAllBtn = document.getElementById('saveAllBtn');
    if (saveAllBtn) {
        saveAllBtn.addEventListener('click', saveAllChanges);
    }
    
    // Attach cancel all button
    const cancelAllBtn = document.getElementById('cancelAllBtn');
    if (cancelAllBtn) {
        cancelAllBtn.addEventListener('click', cancelAllChanges);
    }
    
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
        displayElement.style.display = 'inline';
        inputElement.style.display = 'none';
        editButton.textContent = 'Edit';
        editButton.classList.remove('btn-primary');
        editButton.classList.add('btn-small');
        editingFields.delete(fieldName);
    } else {
        // Switch to edit mode
        displayElement.style.display = 'none';
        inputElement.style.display = 'inline';
        editButton.textContent = 'Save';
        editButton.classList.remove('btn-small');
        editButton.classList.add('btn-primary');
        editingFields.add(fieldName);
        
        // Focus the input
        inputElement.focus();
    }
    
    // Show/hide save all and cancel all buttons
    updateFormActions();
}

/**
 * Update form action buttons visibility
 */
function updateFormActions() {
    const saveAllBtn = document.getElementById('saveAllBtn');
    const cancelAllBtn = document.getElementById('cancelAllBtn');
    
    if (editingFields.size > 0) {
        if (saveAllBtn) saveAllBtn.style.display = 'inline-block';
        if (cancelAllBtn) cancelAllBtn.style.display = 'inline-block';
    } else {
        if (saveAllBtn) saveAllBtn.style.display = 'none';
        if (cancelAllBtn) cancelAllBtn.style.display = 'none';
    }
}

/**
 * Save all changes
 */
async function saveAllChanges() {
    try {
        if (!supabase || !userProfile) {
            throw new Error('System not initialized');
        }
        
        // Validate all edited fields
        let hasErrors = false;
        for (const fieldName of editingFields) {
            const error = validateField(fieldName);
            if (error) {
                showFieldError(`${fieldName}Error`, error);
                hasErrors = true;
            } else {
                clearFieldError(`${fieldName}Error`);
            }
        }
        
        if (hasErrors) {
            showError('Please fix the errors before saving.');
            return;
        }
        
        // Collect updated data
        const updatedData = { ...userProfile };
        for (const fieldName of editingFields) {
            const inputElement = document.getElementById(fieldName);
            if (inputElement) {
                updatedData[fieldName] = inputElement.value || null;
            }
        }
        
        // Update user metadata in Supabase
        const { error } = await supabase.auth.updateUser({
            data: {
                display_name: updatedData.display_name,
                phone: updatedData.phone,
                birthday: updatedData.birthday,
                gender: updatedData.gender,
                language: updatedData.language,
                city_province: updatedData.city_province,
                country: updatedData.country,
                profile_title: updatedData.profile_title,
                profile_description: updatedData.profile_description,
                hobbies: updatedData.hobbies,
                music: updatedData.music,
                fav_food: updatedData.fav_food,
                relationship_status: updatedData.relationship_status,
                job: updatedData.job,
                account_privacy: updatedData.account_privacy
            }
        });
        
        if (error) {
            throw new Error(error.message);
        }
        
        // Update local profile data
        userProfile = updatedData;
        
        // Switch all fields back to read mode
        for (const fieldName of editingFields) {
            toggleFieldEdit(fieldName);
        }
        
        // Show success message
        showSuccess('Profile updated successfully!');
        
    } catch (error) {
        logger.error('Failed to save profile:', error);
        showError(`Failed to save profile: ${error.message}`);
    }
}

/**
 * Cancel all changes
 */
function cancelAllChanges() {
    // Switch all fields back to read mode
    for (const fieldName of editingFields) {
        toggleFieldEdit(fieldName);
    }
    
    // Reload profile data to reset any changes
    displayProfileData();
    
    showSuccess('Changes cancelled.');
}

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
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
    if (!dateRegex.test(value)) {
        return 'Birthday must be in MM/DD/YYYY format';
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

/**
 * Show field error
 */
function showFieldError(fieldId, message) {
    const errorElement = document.getElementById(fieldId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

/**
 * Clear field error
 */
function clearFieldError(fieldId) {
    const errorElement = document.getElementById(fieldId);
    if (errorElement) {
        errorElement.textContent = '';
        errorElement.style.display = 'none';
    }
}

/**
 * Show error message
 */
function showError(message) {
    const errorElement = document.getElementById('profileGeneralError');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

/**
 * Show success message
 */
function showSuccess(message) {
    // Create a temporary success message
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(successDiv);
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.parentNode.removeChild(successDiv);
        }
    }, 3000);
}

/**
 * Handle logout
 */
async function handleLogout() {
    try {
        if (!supabase) {
            showError('Authentication system not initialized. Please refresh the page.');
            return;
        }
        
        logger.info('Logging out user');
        
        // Sign out from Supabase
        const { error } = await supabase.auth.signOut();
        if (error) {
            logger.error('Logout error:', error);
        }
        
        // Clear any JS-readable cookies
        document.cookie = 'sb-access-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = 'sb-refresh-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        
        // Clear localStorage
        localStorage.removeItem('sb-' + supabase.supabaseUrl.split('//')[1].split('.')[0] + '-auth-token');
        
        // Redirect to homepage
        window.location.assign('/');
        
    } catch (error) {
        logger.error('Logout failed:', error);
        showError('Logout failed. Please try again.');
    }
}
