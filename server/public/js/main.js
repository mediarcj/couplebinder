// File: server/public/js/main.js
// Description: Client-side JavaScript for Detechify frontend
// Purpose: Handles form interactions, character counting, and API calls
// Notes: Includes text submission form validation and submissions viewing functionality

/**
 * Frontend Logger with DEBUG flag support
 * 
 * WHAT:
 * A tiny logger that gates verbose logs behind a DEBUG flag.
 * 
 * WHY:
 * Production console should be quiet. Developers can enable verbose logs
 * by setting ?debug=1 in URL or localStorage.debug=1.
 * 
 * HOW:
 * - info/warn: only log when DEBUG is enabled
 * - error: always log (critical issues need visibility)
 * - Check for DEBUG via URL param (?debug=1) or localStorage
 */
const logger = {
    _isDebug: () => {
        // Check URL parameter first
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('debug') === '1') return true;
        
        // Check localStorage
        try {
            return localStorage.getItem('debug') === '1';
        } catch (e) {
            return false;
        }
    },
    
    info: (message, ...args) => {
        if (logger._isDebug()) {
            console.log(message, ...args);
        }
    },
    
    warn: (message, ...args) => {
        if (logger._isDebug()) {
            console.warn(message, ...args);
        }
    },
    
    error: (message, ...args) => {
        // Always log errors
        console.error(message, ...args);
    }
};

/**
 * XSS Protection: HTML Escape Function
 * 
 * WHAT:
 * Escapes all HTML special characters to prevent XSS attacks when rendering user content.
 * 
 * WHY:
 * User-submitted text may contain malicious HTML/JavaScript. We must escape it
 * before inserting into innerHTML to prevent stored XSS vulnerabilities.
 * 
 * HOW:
 * Converts dangerous characters to HTML entities: < becomes &lt;, > becomes &gt;, etc.
 * This ensures the browser treats user input as plain text, not executable code.
 * 
 * @param {string} unsafe - User input that may contain malicious HTML
 * @returns {string} HTML-safe escaped string
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Get CSRF token from cookie or meta tag
 * @returns {string} CSRF token
 */
function getCSRFToken() {
    // Try to get from meta tag first
    const metaToken = document.querySelector('meta[name="csrf-token"]');
    if (metaToken) {
        return metaToken.getAttribute('content');
    }
    
    // Fallback to cookie
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'csrf-token') {
            return value;
        }
    }
    
    return '';
}

document.addEventListener('DOMContentLoaded', function() {
    logger.info('Detechify frontend loaded');
    
    // Extract config from data attributes
    const configEl = document.getElementById('app-config');
    if (configEl) {
        window.appConfig = {
            textMinLength: parseInt(configEl.dataset.textMinLength),
            textMaxLength: parseInt(configEl.dataset.textMaxLength),
            supabaseUrl: configEl.dataset.supabaseUrl,
            supabaseAnonKey: configEl.dataset.supabaseAnonKey
        };
        
        // Initialize Supabase client
        logger.info('Initializing Supabase client');
        logger.info('Supabase URL configured');
        logger.info('Supabase Key:', window.appConfig.supabaseAnonKey ? 'Present' : 'Missing');
        
        if (window.appConfig.supabaseUrl && window.appConfig.supabaseAnonKey) {
            try {
                if (typeof supabase === 'undefined') {
                    logger.error('Supabase library not loaded - check if CDN script loaded correctly');
                    return;
                }
                
                logger.info('Creating Supabase client');
                window.supabase = supabase.createClient(window.appConfig.supabaseUrl, window.appConfig.supabaseAnonKey);
                logger.info('Supabase client initialized successfully');
                
                // Test the connection
                window.supabase.auth.getSession().then(({ data: { session }, error }) => {
                    if (error) {
                        logger.error('Supabase session check error:', error);
                    } else {
                        logger.info('Supabase connection test successful');
                    }
                });
                
                // Listen for auth state changes
                // Note: We only update UI for explicit SIGNED_IN and SIGNED_OUT events.
                // INITIAL_SESSION is ignored because checkSessionStatus() will validate
                // the session with the backend first before updating UI.
                window.supabase.auth.onAuthStateChange((event, session) => {
                    logger.info('Auth state changed:', event);
                    if (event === 'SIGNED_IN' && session?.user) {
                        // User explicitly logged in (not initial session load)
                        updateUIForLoggedInUser(session.user.email);
                    } else if (event === 'SIGNED_OUT') {
                        // User explicitly logged out
                        updateUIForLoggedOutUser();
                    }
                    // Ignore INITIAL_SESSION, TOKEN_REFRESHED, etc. - let checkSessionStatus handle it
                });
            } catch (error) {
                logger.error('Failed to initialize Supabase client:', error.message);
            }
        } else {
            logger.error('Supabase configuration missing - URL or Key not found');
        }
    }
    
    // Add smooth scrolling for anchor links
    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href === '#') {
                e.preventDefault();
                return; // Skip links that just have # as href
            }
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Add loading states to buttons
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // Simple loading state
            const originalText = this.textContent;
            this.textContent = 'Loading...';
            this.style.opacity = '0.7';
            
            // Reset after a short delay
            setTimeout(() => {
                this.textContent = originalText;
                this.style.opacity = '1';
            }, 1000);
        });
    });
    
    // Add fade-in animation for feature cards
    const featureCards = document.querySelectorAll('.feature-card');
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    featureCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(card);
    });
    
    // Text submission form functionality
    initializeTextForm();
    initializeSubmissions();
    
    // Login modal functionality
    initializeLoginModal();
    
    // Attach logout handler if button exists (for server-rendered authenticated pages)
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = handleLogout;
    }
    
    // Check session status and update UI
    checkSessionStatus();
});

function initializeTextForm() {
    const textForm = document.getElementById('textForm');
    const textInput = document.getElementById('textInput');
    const charCount = document.getElementById('charCount');
    const resultDiv = document.getElementById('result');
    
    if (!textForm || !textInput || !charCount || !resultDiv) {
        return; // Form elements not found
    }
    
    // Update character count as user types
    textInput.addEventListener('input', function() {
        const count = this.value.length;
        charCount.textContent = count;
        
        // Visual feedback for limits
        const minLength = window.appConfig ? window.appConfig.textMinLength : 20;
        const maxLength = window.appConfig ? window.appConfig.textMaxLength : 5000;
        
        if (count < minLength) {
            charCount.style.color = '#e74c3c';
        } else if (count > maxLength) {
            charCount.style.color = '#e74c3c';
        } else {
            charCount.style.color = '#27ae60';
        }
    });
    
    // Handle form submission
    textForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const text = textInput.value.trim();
        const submitBtn = this.querySelector('button[type="submit"]');
        
        // Show loading state
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Submitting...';
        submitBtn.disabled = true;
        
        try {
            const csrfToken = getCSRFToken();
            const response = await fetch('/api/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({ text: text })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showResult('success', `Success! Text submitted (${data.text_length} characters). Request ID: ${data.requestId}`);
                textInput.value = '';
                charCount.textContent = '0';
            } else {
                showResult('error', `Error: ${data.error}`);
            }
        } catch (error) {
            logger.error('Submission error:', error.message);
            let errorMessage = 'Network error. Please try again.';
            
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage = 'Unable to connect to server. Please check your internet connection.';
            } else if (error.name === 'SyntaxError') {
                errorMessage = 'Server response error. Please try again.';
            }
            
            showResult('error', errorMessage);
        } finally {
            // Reset button
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });
}

function showResult(type, message) {
    const resultDiv = document.getElementById('result');
    if (!resultDiv) return;
    
    resultDiv.className = `result-message ${type}`;
    resultDiv.textContent = message;
    resultDiv.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        resultDiv.style.display = 'none';
    }, 5000);
}

function initializeSubmissions() {
    const viewSubmissionsBtn = document.getElementById('viewSubmissionsBtn');
    const submissionsList = document.getElementById('submissionsList');
    
    if (!viewSubmissionsBtn || !submissionsList) {
        return; // Elements not found
    }
    
    viewSubmissionsBtn.addEventListener('click', async function() {
        const originalText = this.textContent;
        this.textContent = 'Loading...';
        this.disabled = true;
        
        try {
            const response = await fetch('/api/submissions');
            const data = await response.json();
            
            if (response.ok) {
                displaySubmissions(data.submissions);
                this.textContent = 'Hide Submissions';
            } else {
                showResult('error', 'Failed to load submissions');
                this.textContent = originalText;
            }
        } catch (error) {
            logger.error('Load submissions error:', error.message);
            let errorMessage = 'Network error loading submissions';
            
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage = 'Unable to connect to server. Please check your internet connection.';
            } else if (error.name === 'SyntaxError') {
                errorMessage = 'Server response error. Please try again.';
            }
            
            showResult('error', errorMessage);
            this.textContent = originalText;
        } finally {
            this.disabled = false;
        }
    });
}

function displaySubmissions(submissions) {
    const submissionsList = document.getElementById('submissionsList');
    const viewBtn = document.getElementById('viewSubmissionsBtn');
    
    if (!submissionsList) return;
    
    if (submissionsList.style.display === 'none' || submissionsList.style.display === '') {
        // Show submissions
        if (submissions.length === 0) {
            submissionsList.innerHTML = '<p style="text-align: center; color: #6c757d;">No submissions yet. Submit some text above!</p>';
        } else {
            // SECURITY: Escape all user content to prevent XSS attacks
            // User submissions may contain malicious HTML/JS - we escape before rendering
            submissionsList.innerHTML = submissions.map(sub => `
                <div class="submission-item">
                    <div class="submission-header">
                        <span>${escapeHtml(String(sub.text_length))} characters</span>
                        <span class="submission-id">${escapeHtml(sub.id)}</span>
                        <span>${escapeHtml(new Date(sub.timestamp).toLocaleString())}</span>
                    </div>
                    <div class="submission-preview">${escapeHtml(sub.preview)}</div>
                </div>
            `).join('');
        }
        submissionsList.style.display = 'block';
    } else {
        // Hide submissions
        submissionsList.style.display = 'none';
        viewBtn.textContent = 'View Recent Submissions';
    }
}

function initializeLoginModal() {
    const loginLink = document.querySelector('.login-link');
    const modal = document.getElementById('loginModal');
    const closeBtn = document.querySelector('.close');
    const cancelBtn = document.querySelector('.form-actions .btn-secondary');
    const loginForm = document.getElementById('loginForm');
    
    if (!loginLink || !modal) {
        return; // Modal elements not found
    }
    
    // Show modal when login link is clicked
    loginLink.addEventListener('click', function(e) {
        e.preventDefault();
        handleLogin();
    });
    
    // Close modal when close button is clicked
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    // Close modal when cancel button is clicked
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
    }
    
    // Close modal when clicking outside of it
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeModal();
        }
    });
    
    // Handle form submission
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginSubmit);
    }
}

function closeModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'none';
        resetToFormState();
    }
}

function clearLoginForm() {
    const form = document.getElementById('loginForm');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const generalError = document.getElementById('loginGeneralError');
    
    if (form) form.reset();
    if (emailError) emailError.textContent = '';
    if (passwordError) passwordError.textContent = '';
    if (generalError) {
        generalError.textContent = '';
        generalError.style.display = 'none';
    }
}

// Notification Modal Functions
function showNotificationModal(title, message, onClose = null) {
    const modal = document.getElementById('notificationModal');
    const titleEl = document.getElementById('notificationTitle');
    const messageEl = document.getElementById('notificationMessage');
    const closeBtn = document.getElementById('notificationClose');
    const okBtn = document.getElementById('notificationOkBtn');
    
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (modal) modal.style.display = 'block';
    
    // Close modal handlers
    const closeModal = () => {
        modal.style.display = 'none';
        if (onClose) onClose();
    };
    
    if (closeBtn) closeBtn.onclick = closeModal;
    if (okBtn) okBtn.onclick = closeModal;
    
    // Close on outside click
    window.onclick = function(event) {
        if (event.target === modal) {
            closeModal();
        }
    };
}

function showLoginGeneralError(message) {
    const generalError = document.getElementById('loginGeneralError');
    if (generalError) {
        generalError.textContent = message;
        generalError.style.display = 'block';
    }
}

// Modal State Transition Functions
function switchToSuccessState(title, message, onComplete = null) {
    const formState = document.getElementById('loginFormState');
    const successState = document.getElementById('loginSuccessState');
    const successTitle = document.getElementById('successTitle');
    const successMessage = document.getElementById('successMessage');
    const successOkBtn = document.getElementById('successOkBtn');
    
    if (successTitle) successTitle.textContent = title;
    if (successMessage) successMessage.textContent = message;
    
    // Set up OK button handler
    if (successOkBtn) {
        successOkBtn.onclick = () => {
            if (onComplete) onComplete();
        };
    }
    
    // Start transition
    if (formState && successState) {
        // Hide form state with slide out animation
        formState.classList.add('hidden');
        
        // After form is hidden, show success state with slide in animation
        setTimeout(() => {
            formState.style.display = 'none';
            successState.style.display = 'block';
            successState.classList.add('showing');
            
            // Trigger the slide in animation
            setTimeout(() => {
                successState.classList.remove('showing');
            }, 10);
        }, 300); // Match CSS transition duration
    }
}

function resetToFormState() {
    const formState = document.getElementById('loginFormState');
    const successState = document.getElementById('loginSuccessState');
    
    if (formState && successState) {
        // Hide success state
        successState.style.display = 'none';
        successState.classList.remove('showing');
        
        // Show form state
        formState.style.display = 'block';
        formState.classList.remove('hidden');
        
        // Clear form and errors
        clearLoginForm();
    }
}

function validateEmail(email) {
    if (!email) {
        return 'Email address is required';
    }
    if (email.length > 40) {
        return 'Email address must be 40 characters or less';
    }
    if (email.includes(' ')) {
        return 'Email address cannot contain spaces';
    }
    if (!email.includes('@')) {
        return 'Email address must contain @ symbol';
    }
    if (!email.includes('.')) {
        return 'Email address must contain a dot (.)';
    }
    if (email.indexOf('@') !== email.lastIndexOf('@')) {
        return 'Email address can only contain one @ symbol';
    }
    if (email.indexOf('@') === 0 || email.indexOf('@') === email.length - 1) {
        return 'Email address cannot start or end with @ symbol';
    }
    if (email.indexOf('.') === 0 || email.indexOf('.') === email.length - 1) {
        return 'Email address cannot start or end with a dot';
    }
    if (email.indexOf('@') > email.lastIndexOf('.')) {
        return 'Dot must come after @ symbol in email address';
    }
    // Check for valid characters only (letters, numbers, @, ., -, _)
    const validEmailRegex = /^[a-zA-Z0-9@._-]+$/;
    if (!validEmailRegex.test(email)) {
        return 'Email address can only contain letters, numbers, @, ., -, and _';
    }
    return '';
}

function validatePassword(password) {
    if (!password) {
        return 'Password is required';
    }
    // Check for valid characters only (letters and numbers)
    const validPasswordRegex = /^[a-zA-Z0-9]+$/;
    if (!validPasswordRegex.test(password)) {
        return 'Password can only contain uppercase letters, lowercase letters, and numbers';
    }
    return '';
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    // Clear previous errors
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    
    if (emailError) emailError.textContent = '';
    if (passwordError) passwordError.textContent = '';
    
    let hasErrors = false;
    
    // Validate email
    const emailErrorMsg = validateEmail(email);
    if (emailErrorMsg && emailError) {
        emailError.textContent = emailErrorMsg;
        hasErrors = true;
    }
    
    // Validate password
    const passwordErrorMsg = validatePassword(password);
    if (passwordErrorMsg && passwordError) {
        passwordError.textContent = passwordErrorMsg;
        hasErrors = true;
    }
    
    if (!hasErrors) {
        // Use Supabase Auth for login
        try {
            if (!window.supabase) {
                showLoginGeneralError('Authentication system not initialized. Please refresh the page.');
                return;
            }
            
            logger.info('Attempting login with Supabase');
            logger.info('Supabase client available:', !!window.supabase);
            
            const { data, error } = await window.supabase.auth.signInWithPassword({
                email: email,
                password: password
            });
            
            logger.info('Login response received');
            
            if (error) {
                logger.error('Login failed:', error.message);
                showLoginGeneralError(`Login failed: ${error.message}`);
            } else {
                logger.info('Login successful');
                
                /**
                 * WHAT:
                 * We have a valid Supabase session with an access token.
                 * 
                 * WHY:
                 * The token needs to be stored in an HttpOnly cookie (secure, no JS access).
                 * JavaScript-set cookies can be stolen via XSS. Server-set HttpOnly cookies cannot.
                 * 
                 * HOW:
                 * 1. Extract access token from Supabase session
                 * 2. Call /auth/set-cookie endpoint with Bearer token
                 * 3. Server sets HttpOnly cookie with proper security flags
                 * 4. Clear any old JS-readable cookies
                 * 5. Redirect to dashboard
                 */
                
                // Verify we have a proper access token
                const access = data.session?.access_token;
                if (!access || access.split('.').length !== 3) {
                    logger.error('No access token received from authentication');
                    showLoginGeneralError('Login failed: no access token');
                    return;
                }
                
                try {
                    // Call server endpoint to set HttpOnly cookie
                    const cookieResponse = await fetch('/auth/set-cookie', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${access}`,
                            'Content-Type': 'application/json'
                        },
                        credentials: 'include'  // Required for cookies
                    });
                    
                    if (!cookieResponse.ok) {
                        logger.error('Failed to set authentication cookie');
                        showLoginGeneralError('Login failed: could not set session');
                        return;
                    }
                    
                    const cookieResult = await cookieResponse.json();
                    if (!cookieResult.ok) {
                        logger.error('Server rejected authentication cookie');
                        showLoginGeneralError('Login failed: invalid session');
                        return;
                    }
                    
                    // Clear any old JS-readable cookies (security cleanup)
                    document.cookie = 'sb-access-token=; Path=/; Max-Age=0';
                    document.cookie = 'sb_access_token=; Path=/; Max-Age=0';
                    document.cookie = 'sb-refresh-token=; Path=/; Max-Age=0';
                    
                    logger.info('Secure authentication cookie set by server');
                    
                    switchToSuccessState(
                        'Login Successful!', 
                        `Welcome ${data.user.email}!`,
                        () => {
                            closeModal();
                            // Redirect to dashboard (HttpOnly cookie will be sent automatically)
                            window.location.assign('/dashboard');
                        }
                    );
                } catch (cookieError) {
                    logger.error('Cookie setup failed:', cookieError.message);
                    showLoginGeneralError('Login failed: session setup error');
                }
            }
        } catch (error) {
            logger.error('Login error:', error);
            let errorMessage = 'Network error. Please try again.';
            
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                errorMessage = 'Unable to connect to authentication server. Please check your internet connection.';
            } else if (error.name === 'SyntaxError') {
                errorMessage = 'Server response error. Please try again.';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            showLoginGeneralError(errorMessage);
        }
    }
}

/**
 * Check session status on page load
 * 
 * WHAT:
 * We check if the user has an existing valid session.
 * 
 * WHY:
 * When a user refreshes the page or visits after closing the tab,
 * Supabase may have a valid session in localStorage. We need to restore
 * the HttpOnly cookie - but ONLY if the backend accepts the token.
 * 
 * HOW:
 * 1. Check Supabase for existing session
 * 2. If session exists, try to set HttpOnly cookie via /auth/set-cookie
 * 3. If backend accepts (200 OK), update UI to logged-in state
 * 4. If backend rejects (400/401), the token is invalid - update UI to logged-out state
 * 5. This prevents showing "Logout" briefly for invalid/expired sessions
 */
async function checkSessionStatus() {
    try {
        // Check if Supabase has an existing session
        const { data: { session }, error } = await window.supabase.auth.getSession();
        
        if (error || !session?.access_token) {
            logger.info('No existing session found');
            updateUIForLoggedOutUser();
            return;
        }
        
        // We have a session in localStorage - but is it still valid?
        // Try to set the HttpOnly cookie. If backend accepts it, we're logged in.
        try {
            const response = await fetch('/auth/set-cookie', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                // Backend accepted the token - session is valid
                const result = await response.json();
                if (result.ok) {
                    logger.info('Session restored');
                    // Get fresh user data to update UI
                    const { data: { user } } = await window.supabase.auth.getUser();
                    if (user) {
                        updateUIForLoggedInUser(user.email);
                    } else {
                        updateUIForLoggedOutUser();
                    }
                    return;
                }
            }
            
            // Backend rejected the token - session is invalid
            logger.info('Session expired or invalid');
            // Clear the stale Supabase session
            await window.supabase.auth.signOut();
            updateUIForLoggedOutUser();
            
        } catch (cookieError) {
            logger.info('Session validation failed');
            updateUIForLoggedOutUser();
        }
    } catch (error) {
        logger.info('Session check failed');
        updateUIForLoggedOutUser();
    }
}

/**
 * Update UI to show logged-in state
 * 
 * WHAT:
 * We update the navigation to show Dashboard button and Logout button.
 * 
 * WHY:
 * When a user is authenticated, they should see:
 * - Dashboard button (to navigate to dashboard)
 * - Logout button (to sign out)
 * This matches the dashboard page style for consistency.
 * 
 * HOW:
 * 1. Find the auth section in the nav
 * 2. Replace login link with Dashboard button + Logout button
 * 3. Attach logout handler to the Logout button
 */
function updateUIForLoggedInUser(userEmail) {
    const authSection = document.querySelector('.auth-section');
    if (authSection) {
        // Replace content with Dashboard button + Logout button (matches dashboard style)
        authSection.innerHTML = `
            <a href="/dashboard" class="dashboard-link btn btn-primary">Dashboard</a>
            <button id="logoutBtn" class="btn btn-secondary">Logout</button>
        `;
        
        // Attach logout handler to button
        const logoutBtn = authSection.querySelector('#logoutBtn');
        if (logoutBtn) {
            logoutBtn.onclick = handleLogout;
        }
    }
}

/**
 * Update UI to show logged-out state
 * 
 * WHAT:
 * We update the navigation to show only Login link.
 * 
 * WHY:
 * When no user is authenticated, they should only see the Login option.
 * 
 * HOW:
 * 1. Find the auth section in the nav
 * 2. Replace content with Login link only
 * 3. Attach login modal handler
 */
function updateUIForLoggedOutUser() {
    const authSection = document.querySelector('.auth-section');
    if (authSection) {
        // Replace content with Login link only
        authSection.innerHTML = `
            <a href="#" class="login-link">Login</a>
        `;
        
        // Attach login handler
        const loginLink = authSection.querySelector('.login-link');
        if (loginLink) {
            loginLink.onclick = (e) => {
                e.preventDefault();
                handleLogin();
            };
        }
    }
}

async function handleLogout() {
    try {
        if (!window.supabase) {
            showNotificationModal('Error', 'Authentication system not initialized. Please refresh the page.');
            return;
        }
        
        /**
         * WHAT:
         * We log the user out and clear all authentication state.
         * 
         * WHY:
         * On logout, we must invalidate the session completely by:
         * - Clearing the HttpOnly cookie (server-side session)
         * - Signing out from Supabase (client-side session + localStorage)
         * - Clearing any JS-readable cookies (legacy cleanup)
         * - Redirecting to homepage with page reload (clears any cached state)
         * 
         * HOW:
         * 1. Call /auth/clear-cookie to remove HttpOnly cookie (backend session)
         * 2. Call Supabase signOut to clear client session + localStorage
         * 3. Clear any old JS-readable cookies (security cleanup)
         * 4. Show success modal
         * 5. Redirect to homepage with hard reload (clears all cached state)
         */
        
        // Step 1: Clear server-side HttpOnly cookie FIRST (most critical)
        try {
            await fetch('/auth/clear-cookie', {
                method: 'POST',
                credentials: 'include'  // Required for cookies
            });
            logger.info('Server HttpOnly cookie cleared');
        } catch (e) {
            // Continue even if clear-cookie fails (cookie will expire anyway)
            logger.warn('Server cookie clear failed, but continuing logout');
        }
        
        // Step 2: Sign out from Supabase (clears client-side session + localStorage)
        // CRITICAL: We must wait for signOut to complete before redirecting,
        // otherwise the page reload will find the stale session in localStorage
        // and restore it via checkSessionStatus()
        try {
            const { error } = await window.supabase.auth.signOut();
            if (error) {
                logger.info('Supabase signOut returned error (non-critical):', error.message);
            } else {
                logger.info('Supabase session cleared');
            }
        } catch (supabaseError) {
            // Supabase client error - non-critical, server cookie already cleared
            logger.info('Supabase signOut exception (non-critical):', supabaseError.message);
        }
        
        // Step 3: Clear any old JS-readable cookies (security cleanup)
        document.cookie = 'sb-access-token=; Path=/; Max-Age=0; SameSite=Lax';
        document.cookie = 'sb_access_token=; Path=/; Max-Age=0; SameSite=Lax';
        document.cookie = 'sb-refresh-token=; Path=/; Max-Age=0; SameSite=Lax';
        logger.info('JS-readable cookies cleared');
        
        // Step 4: Force clear Supabase localStorage (manual cleanup)
        // This ensures no stale session data remains before redirect
        try {
            localStorage.removeItem('supabase.auth.token');
            // Supabase uses a dynamic key like: sb-{project-ref}-auth-token
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('sb-') && key.includes('auth-token')) {
                    localStorage.removeItem(key);
                    logger.info('Cleared Supabase localStorage key:', key);
                }
            });
        } catch (storageError) {
            logger.info('localStorage cleanup skipped (non-critical)');
        }
        
        // Step 5: Show success modal and redirect with hard reload
        showNotificationModal(
            'Logout Successful!', 
            'You have been logged out successfully!',
            () => {
                // Force navigation to homepage with hard reload to clear all cached state
                window.location.href = '/';
            }
        );
    } catch (error) {
        logger.error('Logout error:', error.message);
        showNotificationModal('Network Error', 'Network error during logout. Please try again.');
    }
}

function handleLogin() {
    document.getElementById('loginModal').style.display = 'block';
}
