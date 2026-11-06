/**
 * Client-Side Script for My Experiences Page
 * Strict Helmet CSP compliance (no inline handlers)
 */

document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".delete-exp-form").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      const confirmed = window.confirm(
        "Are you sure you want to delete this interview experience? This action will permanently remove the post, all comments, and reports."
      );
      if (!confirmed) {
        e.preventDefault();
      }
    });
  });
});

