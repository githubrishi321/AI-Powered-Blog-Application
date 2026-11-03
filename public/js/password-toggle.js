/**
 * Password Visibility Toggle
 * Unobtrusive, CSP-compliant password toggle with accessibility support
 */
document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', (event) => {
    const toggleBtn = event.target.closest('.toggle-password');
    if (!toggleBtn) return;

    const targetId = toggleBtn.getAttribute('data-target') || toggleBtn.dataset.target;
    if (!targetId) return;

    const passwordInput = document.getElementById(targetId);
    if (!passwordInput) return;

    const icon = toggleBtn.querySelector('i');
    const isPassword = passwordInput.getAttribute('type') === 'password';

    if (isPassword) {
      passwordInput.setAttribute('type', 'text');
      toggleBtn.setAttribute('aria-label', 'Hide password');
      toggleBtn.setAttribute('aria-pressed', 'true');
      if (icon) {
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
      }
    } else {
      passwordInput.setAttribute('type', 'password');
      toggleBtn.setAttribute('aria-label', 'Show password');
      toggleBtn.setAttribute('aria-pressed', 'false');
      if (icon) {
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
      }
    }

    // Return focus to input and keep cursor at end of text
    passwordInput.focus();
    if (typeof passwordInput.setSelectionRange === 'function') {
      const len = passwordInput.value.length;
      passwordInput.setSelectionRange(len, len);
    }
  });
});

