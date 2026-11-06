/**
 * Client-Side Script for Experience Reporting
 * Strict Helmet CSP compliance (no inline JS or inline styles)
 */

document.addEventListener("DOMContentLoaded", function () {
  const reportForm = document.getElementById("reportForm");
  const reportNote = document.getElementById("reportNote");
  const reportNoteCounter = document.getElementById("reportNoteCounter");
  const submitReportBtn = document.getElementById("submitReportBtn");
  const reportAlert = document.getElementById("reportAlert");
  const reportModalEl = document.getElementById("reportModal");

  if (!reportForm) return;

  // Character counter for report note
  if (reportNote && reportNoteCounter) {
    reportNote.addEventListener("input", function () {
      const len = reportNote.value.length;
      reportNoteCounter.textContent = `${len} / 300`;
      if (len > 300) {
        reportNoteCounter.classList.add("text-danger");
      } else {
        reportNoteCounter.classList.remove("text-danger");
      }
    });
  }

  // Handle report submission via fetch with fallback
  reportForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const reasonSelect = document.getElementById("reportReason");
    if (!reasonSelect || !reasonSelect.value) {
      if (reportAlert) {
        reportAlert.textContent = "Please select a report reason.";
        reportAlert.classList.remove("d-none");
      }
      return;
    }

    if (submitReportBtn) {
      submitReportBtn.disabled = true;
      submitReportBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Submitting...';
    }

    if (reportAlert) {
      reportAlert.classList.add("d-none");
    }

    try {
      const formData = new FormData(reportForm);
      const csrfToken = formData.get("_csrf") || "";
      const urlSearchParams = new URLSearchParams(formData);

      const headers = {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      };
      if (csrfToken) {
        headers["x-csrf-token"] = csrfToken;
      }

      const response = await fetch(reportForm.action, {
        method: "POST",
        headers,
        body: urlSearchParams.toString(),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        // Success: hide modal and reload or alert
        if (typeof bootstrap !== "undefined" && reportModalEl) {
          const modalInstance = bootstrap.Modal.getInstance(reportModalEl);
          if (modalInstance) modalInstance.hide();
        }
        alert(data.message || "Thank you for reporting. Our team will review this post.");
        window.location.reload();
      } else {
        // Error from server (e.g. duplicate 11000 or own post)
        if (reportAlert) {
          reportAlert.textContent = data.error || "Failed to submit report. Please try again.";
          reportAlert.classList.remove("d-none");
        }
        if (submitReportBtn) {
          submitReportBtn.disabled = false;
          submitReportBtn.textContent = "Submit Report";
        }
      }
    } catch (err) {
      // Network error or unexpected
      if (reportAlert) {
        reportAlert.textContent = "An error occurred while submitting your report.";
        reportAlert.classList.remove("d-none");
      }
      if (submitReportBtn) {
        submitReportBtn.disabled = false;
        submitReportBtn.textContent = "Submit Report";
      }
    }
  });
});

