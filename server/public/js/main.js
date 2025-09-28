// File: server/public/js/main.js
// Description: Client-side JavaScript for Detechify frontend
// Purpose: Handles form interactions, character counting, and API calls
// Notes: Includes text submission form validation and submissions viewing functionality

document.addEventListener('DOMContentLoaded', function() {
    console.log('Detechify frontend loaded');
    
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
        modal.style.display = 'block';
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
        clearLoginForm();
    }
}

function clearLoginForm() {
    const form = document.getElementById('loginForm');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    
    if (form) form.reset();
    if (emailError) emailError.textContent = '';
    if (passwordError) passwordError.textContent = '';
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

function handleLoginSubmit(e) {
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
        // Form is valid - placeholder for future backend integration
        alert('Login form is valid! Backend integration coming soon.');
    }
}
