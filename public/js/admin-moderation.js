/**
 * public/js/admin-moderation.js
 *
 * External client-side script for Admin Report Detail & Moderation Actions.
 * Strictly CSP-safe: No inline JS, no inline styles.
 */

document.addEventListener("DOMContentLoaded", function () {
  // 1. Delete Experience confirmation guard
  const deleteInput = document.getElementById("deleteConfirmInput");
  const deleteBtn = document.getElementById("deleteConfirmSubmit");

  if (deleteInput && deleteBtn) {
    deleteInput.addEventListener("input", function () {
      if (deleteInput.value.trim() === "DELETE") {
        deleteBtn.removeAttribute("disabled");
      } else {
        deleteBtn.setAttribute("disabled", "disabled");
      }
    });
  }

  // 2. Hide Experience modal note character counter
  const hideNoteInput = document.getElementById("hideNoteInput");
  const hideCharCount = document.getElementById("hideCharCount");

  if (hideNoteInput && hideCharCount) {
    hideNoteInput.addEventListener("input", function () {
      const len = hideNoteInput.value.length;
      hideCharCount.textContent = len + " / 200";
    });
  }
});

