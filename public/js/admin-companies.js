/**
 * public/js/admin-companies.js
 *
 * Client script for admin company management:
 * - Dynamic target search for company merge
 * - Merge preview calculation (N experiences, M aliases)
 * - Exact source name matching validation to enable merge button
 * - Delete confirmation dialog
 *
 * Helmet CSP safe: NO inline event handlers or styles.
 */

document.addEventListener("DOMContentLoaded", function () {
  // ─── 1. Merge Modal Logic ──────────────────────────────────────────────────
  const openMergeModalBtn = document.getElementById("openMergeModalBtn");
  const mergeModalEl = document.getElementById("mergeModal");
  const targetSearchInput = document.getElementById("targetSearchInput");
  const targetCompanySelect = document.getElementById("targetCompanySelect");
  const mergePreviewBox = document.getElementById("mergePreviewBox");
  const mergePreviewText = document.getElementById("mergePreviewText");
  const mergeConfirmNameInput = document.getElementById("mergeConfirmNameInput");
  const submitMergeBtn = document.getElementById("submitMergeBtn");

  let sourceId = "";
  let sourceName = "";
  let sourceExps = 0;
  let sourceAliases = 0;
  let searchTimeout = null;

  if (openMergeModalBtn && mergeModalEl) {
    sourceId = openMergeModalBtn.getAttribute("data-source-id") || "";
    sourceName = (openMergeModalBtn.getAttribute("data-source-name") || "").trim();
    sourceExps = parseInt(openMergeModalBtn.getAttribute("data-source-exps"), 10) || 0;
    sourceAliases = parseInt(openMergeModalBtn.getAttribute("data-source-aliases"), 10) || 0;

    openMergeModalBtn.addEventListener("click", function () {
      if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
        const modal = new bootstrap.Modal(mergeModalEl);
        modal.show();
      } else {
        // Fallback for bootstrap
        mergeModalEl.classList.add("show");
        mergeModalEl.style.display = "block";
      }
      loadTargets("");
    });
  }

  function validateMergeForm() {
    if (!submitMergeBtn) return;
    const selectedTargetId = targetCompanySelect ? targetCompanySelect.value : "";
    const typedName = (mergeConfirmNameInput ? mergeConfirmNameInput.value : "").trim();
    const isTargetValid = Boolean(selectedTargetId);
    const isNameMatched = typedName === sourceName;

    submitMergeBtn.disabled = !(isTargetValid && isNameMatched);
  }

  function updatePreview() {
    if (!targetCompanySelect || !mergePreviewBox || !mergePreviewText) return;
    const selectedOption = targetCompanySelect.options[targetCompanySelect.selectedIndex];
    if (selectedOption && selectedOption.value) {
      const targetName = selectedOption.textContent.split(" (")[0].trim();
      const totalAliasesToMove = sourceAliases + 1; // source name becomes an alias + existing aliases
      mergePreviewText.textContent = `${sourceExps} experience(s) and up to ${totalAliasesToMove} alias(es) will move to "${targetName}".`;
      mergePreviewBox.classList.remove("d-none");
    } else {
      mergePreviewBox.classList.add("d-none");
    }
    validateMergeForm();
  }

  async function loadTargets(query) {
    if (!targetCompanySelect) return;
    try {
      const url = `/admin/companies/search-targets?q=${encodeURIComponent(query)}&excludeId=${encodeURIComponent(sourceId)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const targets = data.targets || [];

      targetCompanySelect.innerHTML = "";
      if (targets.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.disabled = true;
        opt.selected = true;
        opt.textContent = "— No matching active companies found —";
        targetCompanySelect.appendChild(opt);
      } else {
        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.disabled = true;
        defaultOpt.selected = true;
        defaultOpt.textContent = "— Select a target company —";
        targetCompanySelect.appendChild(defaultOpt);

        targets.forEach(function (t) {
          const opt = document.createElement("option");
          opt.value = t._id;
          opt.textContent = `${t.name} (${t.slug})`;
          targetCompanySelect.appendChild(opt);
        });
      }
      updatePreview();
    } catch (err) {
      console.error("Error loading targets:", err);
    }
  }

  if (targetSearchInput) {
    targetSearchInput.addEventListener("input", function () {
      clearTimeout(searchTimeout);
      const q = targetSearchInput.value.trim();
      searchTimeout = setTimeout(() => {
        loadTargets(q);
      }, 250);
    });
  }

  if (targetCompanySelect) {
    targetCompanySelect.addEventListener("change", function () {
      updatePreview();
    });
  }

  if (mergeConfirmNameInput) {
    mergeConfirmNameInput.addEventListener("input", function () {
      validateMergeForm();
    });
  }

  // ─── 2. Delete Confirmation Logic ──────────────────────────────────────────
  const deleteCompanyBtn = document.getElementById("deleteCompanyBtn");
  const deleteCompanyForm = document.getElementById("deleteCompanyForm");

  if (deleteCompanyBtn && deleteCompanyForm) {
    deleteCompanyBtn.addEventListener("click", function (e) {
      e.preventDefault();
      const compName = deleteCompanyBtn.getAttribute("data-company-name") || "this company";
      const confirmed = window.confirm(
        `Are you sure you want to permanently delete "${compName}"?\n\nThis action cannot be undone.`
      );
      if (confirmed) {
        deleteCompanyForm.submit();
      }
    });
  }
});

