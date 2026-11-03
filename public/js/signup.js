/**
 * Password Strength Evaluator for Sign Up
 * Unobtrusive, CSP-compliant listener
 */
document.addEventListener('DOMContentLoaded', () => {
  const passwordInput = document.getElementById('password');
  const strengthBar = document.getElementById('strengthBar');

  if (!passwordInput || !strengthBar) return;

  passwordInput.addEventListener('input', () => {
    const password = passwordInput.value;
    strengthBar.className = 'password-strength-bar';

    if (!password || password.length === 0) {
      strengthBar.style.width = '0%';
      return;
    }

    let strength = 0;

    // Length check
    if (password.length >= 6) strength++;
    if (password.length >= 10) strength++;

    // Contains number
    if (/\d/.test(password)) strength++;

    // Contains special character
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;

    // Contains uppercase and lowercase
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;

    if (strength <= 2) {
      strengthBar.className = 'password-strength-bar strength-weak';
    } else if (strength <= 3) {
      strengthBar.className = 'password-strength-bar strength-medium';
    } else {
      strengthBar.className = 'password-strength-bar strength-strong';
    }
  });
});

