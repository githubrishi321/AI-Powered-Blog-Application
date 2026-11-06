/**
 * Client-Side Script for AI-Assisted Interview Note Structuring
 *
 * Rules:
 * - Strict Helmet CSP compliance (no inline event handlers, no inline styles)
 * - Safe DOM updates via textContent and DOM manipulation (no innerHTML with untrusted data)
 * - Reuses window.populateExperienceRounds from experience-form.js
 * - Never auto-submits the form
 */

document.addEventListener("DOMContentLoaded", function () {
  const notesInput = document.getElementById("aiNotesInput");
  const charCounter = document.getElementById("aiNotesCharCounter");
  const btnStructure = document.getElementById("btnStructureNotes");
  const statusContainer = document.getElementById("aiStructureStatus");
  const banner = document.getElementById("aiFilledBanner");
  const bannerMeta = document.getElementById("aiFilledBannerMeta");

  // Form Fields
  const form = document.getElementById("experienceForm");
  const companyInput = document.getElementById("companyInput");
  const roleInput = document.getElementById("roleInput");
  const driveTypeSelect = document.getElementById("driveTypeSelect");
  const yearInput = document.getElementById("yearInput");
  const diffSelect = document.getElementById("diffSelect");
  const outcomeSelect = document.getElementById("outcomeSelect");
  const tipsInput = document.getElementById("tipsInput");
  const storyInput = document.getElementById("storyInput");

  if (!btnStructure || !notesInput) return;

  const MIN_NOTES_LENGTH = 80;
  const MAX_NOTES_LENGTH = 6000;

  // 1. Live character counter for Notes textarea
  notesInput.addEventListener("input", function () {
    const len = notesInput.value.length;
    if (charCounter) {
      charCounter.textContent = `${len} / ${MAX_NOTES_LENGTH}`;
      if (len > MAX_NOTES_LENGTH) {
        charCounter.classList.add("text-danger");
      } else {
        charCounter.classList.remove("text-danger");
      }
    }
  });

  // Helper to show new company warning hint safely
  function updateCompanyHint(companyName) {
    if (!companyInput) return;
    let hintEl = document.getElementById("companyNewHint");
    if (!hintEl && companyInput.parentNode) {
      hintEl = document.createElement("div");
      hintEl.id = "companyNewHint";
      hintEl.className = "form-text text-muted mt-1";
      companyInput.parentNode.appendChild(hintEl);
    }
    if (!hintEl) return;
    const trimmed = (companyName || "").trim();
    if (!trimmed) {
      hintEl.textContent = "";
      return;
    }
    let datalist = companyInput.list;
    if (!datalist) {
      const listId = companyInput.getAttribute("list");
      if (listId) datalist = document.getElementById(listId);
    }
    const options = datalist
      ? Array.from(datalist.options || []).map((o) => (o.value || "").trim().toLowerCase())
      : [];
    if (!options.includes(trimmed.toLowerCase())) {
      hintEl.textContent = `"${trimmed}" is not in our company list yet. Saving will create a new company page, so check the spelling.`;
    } else {
      hintEl.textContent = "";
    }
  }

  if (companyInput) {
    companyInput.addEventListener("input", function () {
      updateCompanyHint(companyInput.value);
    });
  }

  // Helper to show inline status alerts safely
  function setStatusMessage(message, type) {
    if (!statusContainer) return;
    statusContainer.innerHTML = "";

    const alertDiv = document.createElement("div");
    alertDiv.className = `alert alert-${type} py-2 mb-0 d-flex align-items-center`;
    alertDiv.setAttribute("role", "alert");

    const icon = document.createElement("i");
    icon.className =
      type === "warning" || type === "danger"
        ? "fas fa-exclamation-triangle me-2"
        : "fas fa-info-circle me-2";
    alertDiv.appendChild(icon);

    const span = document.createElement("span");
    span.textContent = message;
    alertDiv.appendChild(span);

    statusContainer.appendChild(alertDiv);
  }

  // Helper to check if user has manually entered data in any field
  function hasUserEnteredData() {
    if (companyInput && companyInput.value.trim().length > 0) return true;
    if (roleInput && roleInput.value.trim().length > 0) return true;
    if (storyInput && storyInput.value.trim().length > 0) return true;
    if (tipsInput && tipsInput.value.trim().length > 0) return true;

    const roundDescs = document.querySelectorAll(
      "#roundsContainer textarea[data-field='description']"
    );
    for (const desc of roundDescs) {
      if (desc.value.trim().length > 0) return true;
    }

    const questionInputs = document.querySelectorAll(
      "#roundsContainer .question-input"
    );
    for (const q of questionInputs) {
      if (q.value.trim().length > 0) return true;
    }

    return false;
  }

  // 2. Button Click Handler
  btnStructure.addEventListener("click", async function () {
    const rawNotes = notesInput.value;
    const trimmed = rawNotes.trim();

    // Clear previous status
    if (statusContainer) statusContainer.innerHTML = "";

    // Client-side length check
    if (trimmed.length < MIN_NOTES_LENGTH) {
      setStatusMessage(
        `Please enter at least ${MIN_NOTES_LENGTH} characters of notes to extract interview details.`,
        "warning"
      );
      notesInput.focus();
      return;
    }

    if (trimmed.length > MAX_NOTES_LENGTH) {
      setStatusMessage(
        `Notes must be at most ${MAX_NOTES_LENGTH} characters.`,
        "warning"
      );
      notesInput.focus();
      return;
    }

    // Overwrite Confirmation
    if (hasUserEnteredData()) {
      const confirmOverwrite = window.confirm(
        "This will overwrite what you've entered. Continue?"
      );
      if (!confirmOverwrite) return;
    }

    // CSRF Token retrieval
    const csrfInput = form ? form.querySelector('input[name="_csrf"]') : null;
    const csrfToken = csrfInput ? csrfInput.value : "";

    // UI Loading State
    const originalBtnText = btnStructure.innerHTML;
    btnStructure.disabled = true;
    btnStructure.innerHTML =
      '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Analyzing notes...';

    if (statusContainer) {
      const loadingDiv = document.createElement("div");
      loadingDiv.className = "text-primary small";
      loadingDiv.innerHTML =
        '<i class="fas fa-circle-notch fa-spin me-2"></i>Analyzing notes with AI... This might take a few seconds.';
      statusContainer.appendChild(loadingDiv);
    }

    try {
      const response = await fetch("/ai/structure", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          notes: rawNotes,
          _csrf: csrfToken,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg =
          result.error ||
          "Could not extract structure from notes. Please try again or fill the form manually.";
        throw new Error(errorMsg);
      }

      // Success Processing
      if (statusContainer) statusContainer.innerHTML = "";

      const data = result.data || {};

      // Remove existing .ai-filled highlights
      document.querySelectorAll(".ai-filled").forEach((el) => {
        el.classList.remove("ai-filled");
      });

      // Pre-fill top-level fields
      if (companyInput && data.company) {
        companyInput.value = data.company;
        companyInput.classList.add("ai-filled");
      }
      updateCompanyHint(data.company || (companyInput ? companyInput.value : ""));
      if (roleInput && data.role) {
        roleInput.value = data.role;
        roleInput.classList.add("ai-filled");
      }
      if (driveTypeSelect && data.driveType) {
        driveTypeSelect.value = data.driveType;
        driveTypeSelect.classList.add("ai-filled");
      }
      if (yearInput && data.year != null) {
        yearInput.value = data.year;
        yearInput.classList.add("ai-filled");
      }
      if (outcomeSelect && data.outcome) {
        outcomeSelect.value = data.outcome;
        outcomeSelect.classList.add("ai-filled");
      }
      if (tipsInput && data.tips) {
        tipsInput.value = data.tips;
        tipsInput.classList.add("ai-filled");
        const tipsCounter = document.getElementById("tipsCounter");
        if (tipsCounter) {
          tipsCounter.textContent = `${data.tips.length} / 2000`;
        }
      }

      // Populate Rounds & Questions
      if (
        Array.isArray(data.rounds) &&
        data.rounds.length > 0 &&
        typeof window.populateExperienceRounds === "function"
      ) {
        const addedCards = window.populateExperienceRounds(data.rounds);
        addedCards.forEach((card) => {
          card.classList.add("ai-filled");
          card.querySelectorAll("input, select, textarea").forEach((field) => {
            if (field.value) field.classList.add("ai-filled");
          });
        });
      }

      // Show Banner
      if (banner) {
        banner.classList.remove("d-none");
        const bannerText = document.getElementById("aiFilledBannerText");
        if (bannerText) {
          bannerText.textContent =
            "AI filled these fields. Check everything and fix mistakes before posting. Difficulty is always chosen by you.";
        }

        if (bannerMeta) {
          bannerMeta.innerHTML = "";
          const metaParts = [];

          if (Array.isArray(result.droppedFields) && result.droppedFields.length > 0) {
            metaParts.push(
              `AI could not find these in your notes: ${result.droppedFields.join(", ")}. Please fill them in.`
            );
          }

          const count = typeof result.roundsFound === "number" ? result.roundsFound : (data.rounds ? data.rounds.length : 0);
          metaParts.push(
            `AI found ${count} round${count === 1 ? "" : "s"}. Check that none are missing or merged.`
          );

          if (typeof result.redactedCount === "number" && result.redactedCount > 0) {
            metaParts.push(
              `${result.redactedCount} contact detail${
                result.redactedCount === 1 ? "" : "s"
              } or link${result.redactedCount === 1 ? "" : "s"} were stripped before processing.`
            );
          }
          if (result.truncated) {
            metaParts.push("Some content was truncated to fit limits.");
          }

          metaParts.forEach((msg) => {
            const p = document.createElement("p");
            p.className = "mb-0 mt-1 small text-muted";
            p.textContent = msg;
            bannerMeta.appendChild(p);
          });
        }
        banner.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch (err) {
      // On error, show server's friendly message in aria-live region
      // Keep notes in textarea!
      setStatusMessage(
        err.message ||
          "Could not extract structure from notes. Please try again or fill the form manually.",
        "danger"
      );
    } finally {
      btnStructure.disabled = false;
      btnStructure.innerHTML = originalBtnText;
    }
  });
});

