// File: server/public/js/main.js
// Description: Client-side JavaScript for Detechify frontend
// Purpose: Handles form interactions, character counting, and API calls
// Notes: Includes text submission form validation and submissions viewing functionality

document.addEventListener('DOMContentLoaded', function() {
    console.log('Detechify frontend loaded');
    
    // Extract config from data attributes
    const configEl = document.getElementById('app-config');
    if (configEl) {
        window.appConfig = {
            textMinLength: parseInt(configEl.dataset.textMinLength),
            textMaxLength: parseInt(configEl.dataset.textMaxLength)
        };
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
            const response = await fetch('/api/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
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
            showResult('error', 'Network error. Please try again.');
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
            showResult('error', 'Network error loading submissions');
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
            submissionsList.innerHTML = submissions.map(sub => `
                <div class="submission-item">
                    <div class="submission-header">
                        <span>${sub.text_length} characters</span>
                        <span class="submission-id">${sub.id}</span>
                        <span>${new Date(sub.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="submission-preview">${sub.preview}</div>
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
        // Submit to backend API
        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });
            
            const data = await response.json();
            
            if (data.success) {
                switchToSuccessState(
                    'Login Successful!', 
                    `Welcome ${data.user.first_name} ${data.user.last_name}!`,
                    () => {
                        closeModal();
                        // Redirect to dashboard after successful login
                        window.location.href = '/dashboard';
                    }
                );
            } else {
                showLoginGeneralError(`Login failed: ${data.message}`);
            }
        } catch (error) {
            showLoginGeneralError('Network error. Please try again.');
        }
    }
}

async function checkSessionStatus() {
    try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        
        if (data.success && data.authenticated) {
            updateUIForLoggedInUser(data.userEmail);
        } else {
            updateUIForLoggedOutUser();
        }
    } catch (error) {
        console.error('Session status check failed:', error);
        updateUIForLoggedOutUser();
    }
}

function updateUIForLoggedInUser(userEmail) {
    const loginLink = document.querySelector('.login-link');
    if (loginLink) {
        loginLink.textContent = `Logout (${userEmail})`;
        loginLink.onclick = handleLogout;
    }
}

function updateUIForLoggedOutUser() {
    const loginLink = document.querySelector('.login-link');
    if (loginLink) {
        loginLink.textContent = 'Login';
        loginLink.onclick = handleLogin;
    }
}

async function handleLogout() {
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotificationModal(
                'Logout Successful!', 
                'You have been logged out successfully!',
                () => {
                    updateUIForLoggedOutUser();
                }
            );
        } else {
            showNotificationModal('Logout Failed', `Logout failed: ${data.message}`);
        }
    } catch (error) {
        showNotificationModal('Network Error', 'Network error during logout. Please try again.');
    }
}

function handleLogin() {
    document.getElementById('loginModal').style.display = 'block';
}
