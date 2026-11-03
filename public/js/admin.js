/**
 * BLOGIFY ADMIN PANEL JAVASCRIPT
 * External, CSP-safe, handles sidebar, modals, CSRF, and bulk selection.
 */

document.addEventListener("DOMContentLoaded", function () {
  // Only initialize on admin pages
  if (!document.body.classList.contains("admin-body") && !document.querySelector(".admin-wrapper")) {
    return;
  }

  // 1. Sidebar Drawer Toggle for Mobile
  const sidebar = document.getElementById("adminSidebar");
  const toggleBtns = document.querySelectorAll(".sidebar-toggle, #sidebarToggleBtn");
  let backdrop = document.querySelector(".admin-sidebar-backdrop");

  if (!backdrop && sidebar) {
    backdrop = document.createElement("div");
    backdrop.className = "admin-sidebar-backdrop";
    document.body.appendChild(backdrop);
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove("open");
    if (backdrop) backdrop.classList.remove("open");
  }

  function openSidebar() {
    if (sidebar) sidebar.classList.add("open");
    if (backdrop) backdrop.classList.add("open");
  }

  toggleBtns.forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (sidebar && sidebar.classList.contains("open")) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  });

  if (backdrop) {
    backdrop.addEventListener("click", closeSidebar);
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && sidebar && sidebar.classList.contains("open")) {
      closeSidebar();
    }
  });

  // 2. Dynamic CSRF Token Injection across all POST forms
  const csrfToken = window.CSRF_TOKEN || (document.querySelector('meta[name="csrf-token"]') ? document.querySelector('meta[name="csrf-token"]').content : "");
  if (csrfToken) {
    document.querySelectorAll("form").forEach(function (form) {
      if (form.method && form.method.toUpperCase() === "POST") {
        let input = form.querySelector('input[name="_csrf"]');
        if (!input) {
          input = document.createElement("input");
          input.type = "hidden";
          input.name = "_csrf";
          input.value = csrfToken;
          form.appendChild(input);
        } else if (!input.value) {
          input.value = csrfToken;
        }

        if (form.enctype && form.enctype.includes("multipart/form-data")) {
          const action = form.getAttribute("action") || window.location.pathname;
          const sep = action.includes("?") ? "&" : "?";
          if (!action.includes("_csrf=")) {
            form.setAttribute("action", action + sep + "_csrf=" + encodeURIComponent(csrfToken));
          }
        }
      }
    });
  }

  // 3. Reusable Delete Confirmation Modal
  const confirmModalEl = document.getElementById("adminConfirmModal");
  let confirmModalInstance = null;
  if (confirmModalEl && typeof bootstrap !== "undefined" && bootstrap.Modal) {
    confirmModalInstance = bootstrap.Modal.getOrCreateInstance(confirmModalEl);
  }

  document.addEventListener("click", function (e) {
    const trigger = e.target.closest(".btn-delete-trigger");
    if (!trigger) return;

    e.preventDefault();
    const url = trigger.getAttribute("data-url");
    const name = trigger.getAttribute("data-item-name") || "this item";
    const type = trigger.getAttribute("data-item-type") || "record";

    if (!url) return;

    const modalForm = document.getElementById("adminConfirmForm");
    const modalBody = document.getElementById("adminConfirmModalBody");
    const modalTitle = document.getElementById("adminConfirmModalLabel");

    if (modalForm) modalForm.action = url;
    if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-trash me-2"></i>Delete ' + (type.charAt(0).toUpperCase() + type.slice(1));
    if (modalBody) {
      modalBody.innerHTML = `
        <div class="alert alert-danger mb-3">
          <i class="fas fa-exclamation-triangle me-2"></i><strong>Warning:</strong> This action cannot be undone.
        </div>
        <p class="mb-0">Are you sure you want to permanently delete <strong>"${escapeHtml(name)}"</strong>?</p>
      `;
    }

    if (confirmModalInstance) {
      confirmModalInstance.show();
    } else if (confirmModalEl && typeof bootstrap !== "undefined") {
      new bootstrap.Modal(confirmModalEl).show();
    }
  });

  // 4. Bulk Selection & Bulk Deletion Handlers
  setupBulkHandler("selectAllBlogs", ".blog-checkbox", "bulkForm", "blog(s)");
  setupBulkHandler("selectAllComments", ".comment-checkbox", "bulkCommentForm", "comment(s)");
  setupBulkHandler("selectAllUsers", ".user-checkbox", "bulkUserForm", "user(s)");

  function setupBulkHandler(selectAllId, itemCheckboxClass, formId, itemNoun) {
    const selectAll = document.getElementById(selectAllId);
    const form = document.getElementById(formId);

    if (selectAll) {
      selectAll.addEventListener("change", function () {
        document.querySelectorAll(itemCheckboxClass).forEach(function (cb) {
          cb.checked = selectAll.checked;
        });
      });
    }

    if (form) {
      const applyBtn = form.querySelector(".btn-bulk-apply, button[type='submit']");
      if (applyBtn) {
        applyBtn.addEventListener("click", function (e) {
          const actionInput = form.querySelector("select[name='action'], input[name='action']");
          const actionVal = actionInput ? actionInput.value : "";
          const checked = form.querySelectorAll(itemCheckboxClass + ":checked");

          if (!actionVal) {
            alert("Please select an action.");
            e.preventDefault();
            return;
          }

          if (checked.length === 0) {
            alert("Please select at least one " + itemNoun.replace(/\(s\)/, "") + ".");
            e.preventDefault();
            return;
          }

          if (actionVal === "delete") {
            e.preventDefault();
            const modalForm = document.getElementById("adminConfirmForm");
            const modalBody = document.getElementById("adminConfirmModalBody");
            const modalTitle = document.getElementById("adminConfirmModalLabel");

            if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-trash me-2"></i>Confirm Bulk Delete';
            if (modalBody) {
              modalBody.innerHTML = `
                <div class="alert alert-danger mb-3">
                  <i class="fas fa-exclamation-triangle me-2"></i><strong>Permanent Action:</strong>
                  You are about to delete <strong>${checked.length}</strong> ${itemNoun}.
                </div>
                <p class="mb-0">This will permanently remove the selected records and their associated data.</p>
              `;
            }

            // Temporarily intercept confirm modal submission to submit the bulk form
            const confirmBtn = document.getElementById("adminConfirmSubmitBtn");
            const onConfirm = function (ev) {
              ev.preventDefault();
              confirmBtn.removeEventListener("click", onConfirm);
              if (confirmModalInstance) confirmModalInstance.hide();
              form.submit();
            };
            confirmBtn.addEventListener("click", onConfirm, { once: true });

            if (confirmModalInstance) confirmModalInstance.show();
          }
        });
      }
    }
  }

  // 5. User Detail Page Helpers
  const copyBtn = document.getElementById("copyTempPasswordBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      const field = document.getElementById("tempPasswordField");
      if (field) {
        navigator.clipboard.writeText(field.value).then(function () {
          copyBtn.innerHTML = '<i class="fas fa-check me-1"></i>Copied!';
          setTimeout(function () {
            copyBtn.innerHTML = '<i class="fas fa-copy me-1"></i>Copy';
          }, 2000);
        });
      }
    });
  }

  const genPassBtn = document.getElementById("generateRandomPasswordBtn");
  if (genPassBtn) {
    genPassBtn.addEventListener("click", function () {
      const passField = document.getElementById("newPasswordField");
      if (passField) {
        const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
        let pass = "";
        for (let i = 0; i < 16; i++) {
          pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        passField.value = pass;
      }
    });
  }

  const radioReassign = document.getElementById("reassignContent");
  const radioDelete = document.getElementById("deleteContent");
  const reassignField = document.getElementById("reassignField");

  if (radioReassign && radioDelete && reassignField) {
    radioReassign.addEventListener("change", function () {
      if (radioReassign.checked) reassignField.classList.remove("d-none");
    });
    radioDelete.addEventListener("change", function () {
      if (radioDelete.checked) reassignField.classList.add("d-none");
    });
  }

  // 6. Profile & Cover Image Previews
  const imgInput = document.getElementById("profileImage") || document.getElementById("coverImage");
  if (imgInput) {
    imgInput.addEventListener("change", function () {
      const file = this.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        const preview = document.getElementById("profilePreview") || document.getElementById("coverPreview");
        if (preview && preview.tagName === "IMG") {
          preview.src = e.target.result;
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // 7. Password Visibility Toggle
  const togglePassBtn = document.getElementById("togglePassword");
  if (togglePassBtn) {
    togglePassBtn.addEventListener("click", function () {
      const input = document.getElementById("password");
      const icon = document.getElementById("togglePasswordIcon");
      if (!input) return;
      if (input.type === "password") {
        input.type = "text";
        if (icon) icon.classList.replace("fa-eye", "fa-eye-slash");
      } else {
        input.type = "password";
        if (icon) icon.classList.replace("fa-eye-slash", "fa-eye");
      }
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
