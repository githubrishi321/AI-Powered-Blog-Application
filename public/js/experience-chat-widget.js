/**
 * experience-chat-widget.js
 *
 * Floating chatbot widget for the interview-experience section.
 * Talks to POST /ai/chat — grounded-only answers from student experiences
 * already on this platform.
 *
 * Features:
 * - Persistent chat history scoped per logged-in user (persists across page reloads/navigation).
 * - "Clear Chat" button to reset conversation history whenever desired.
 * - Strict Helmet CSP compliance (no inline events, safe DOM methods).
 * - Safe DOM: textContent / createElement only (no innerHTML with user data).
 */

(function () {
  "use strict";

  /* ── DOM refs ─────────────────────────────────────────────────────────── */
  const launcher  = document.getElementById("cwLauncher");
  const panel     = document.getElementById("cwPanel");
  const closeBtn  = document.getElementById("cwCloseBtn");
  const clearBtn  = document.getElementById("cwClearBtn");
  const messages  = document.getElementById("cwMessages");
  const input     = document.getElementById("cwInput");
  const sendBtn   = document.getElementById("cwSendBtn");

  // Widget is optional — if not rendered on this page, exit silently.
  if (!launcher || !panel || !input || !sendBtn || !messages) return;

  /* ── User & Storage Key ───────────────────────────────────────────────── */
  const userId = (panel.getAttribute("data-user-id") || "").trim();
  const STORAGE_KEY = userId ? "blogify_chat_history_" + userId : "blogify_chat_guest";

  /* ── State ────────────────────────────────────────────────────────────── */
  let isOpen      = false;
  let isBusy      = false;   // request in-flight
  let csrfToken   = "";
  let chatHistory = [];      // In-memory messages array

  /* ── CSRF token: read from the meta tag written by the server ─────────── */
  function fetchCsrfToken() {
    const meta = document.querySelector("meta[name='csrf-token']");
    if (meta) csrfToken = meta.getAttribute("content") || "";
  }
  fetchCsrfToken();

  /* ── Default Greeting ─────────────────────────────────────────────────── */
  function renderDefaultGreeting() {
    messages.textContent = "";
    const div = document.createElement("div");
    div.className = "cw-msg cw-msg-bot";
    div.textContent =
      "Hi! Ask me about any company's interview process — I'll search experiences " +
      "shared by students here and give you grounded prep advice.\n\n" +
      'Try: "Preparing for Google SDE Intern"';
    messages.appendChild(div);
  }

  /* ── History Persistence ──────────────────────────────────────────────── */
  function saveHistory() {
    try {
      // Keep at most 50 messages to keep localStorage light
      const toSave = chatHistory.slice(-50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      // localStorage may fail in quota exceeded or private mode
    }
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          chatHistory = parsed;
          messages.textContent = "";
          chatHistory.forEach(function (item) {
            appendMessageToDOM(item.text, item.role);
            if (item.sourceCount > 0) {
              appendSourceNoteToDOM(item.sourceCount);
            }
          });
          scrollToBottom();
          return;
        }
      }
    } catch (e) {
      chatHistory = [];
    }
    renderDefaultGreeting();
  }

  function clearHistory() {
    chatHistory = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    renderDefaultGreeting();
  }

  // Load saved history on startup
  loadHistory();

  /* ── Open / close ─────────────────────────────────────────────────────── */
  function openPanel() {
    isOpen = true;
    panel.classList.add("cw-open");
    launcher.setAttribute("aria-expanded", "true");
    scrollToBottom();
    // Delay focus so the CSS transition doesn't fight with it
    setTimeout(function () { input.focus(); }, 220);
  }

  function closePanel() {
    isOpen = false;
    panel.classList.remove("cw-open");
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  }

  launcher.addEventListener("click", function () {
    if (isOpen) { closePanel(); } else { openPanel(); }
  });

  closeBtn.addEventListener("click", closePanel);

  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      if (confirm("Clear your interview prep chat history?")) {
        clearHistory();
      }
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen) {
      e.preventDefault();
      closePanel();
    }
  });

  /* ── Enable/disable send while typing ────────────────────────────────── */
  input.addEventListener("input", function () {
    const hasText = input.value.trim().length > 0;
    sendBtn.disabled = !hasText || isBusy;

    // Auto-grow textarea (up to CSS max-height)
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 100) + "px";
  });

  /* ── Send on Enter (Shift+Enter = newline) ───────────────────────────── */
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) { submitQuestion(); }
    }
  });

  sendBtn.addEventListener("click", submitQuestion);

  /* ── DOM helpers ─────────────────────────────────────────────────────── */
  function appendMessageToDOM(text, role) {
    // role: "user" | "bot" | "system"
    const div = document.createElement("div");
    div.className = "cw-msg cw-msg-" + role;
    div.textContent = text;
    messages.appendChild(div);
    scrollToBottom();
    return div;
  }

  function appendSourceNoteToDOM(count) {
    const p = document.createElement("p");
    p.className = "cw-source-note";
    p.textContent = "Based on " + count + " experience" + (count === 1 ? "" : "s") + " from this platform.";
    messages.appendChild(p);
    scrollToBottom();
  }

  function addMessage(text, role, sourceCount) {
    appendMessageToDOM(text, role);
    if (sourceCount > 0) {
      appendSourceNoteToDOM(sourceCount);
    }
    chatHistory.push({
      role: role,
      text: text,
      sourceCount: sourceCount || 0,
      timestamp: Date.now(),
    });
    saveHistory();
  }

  function showTyping() {
    const dot = document.createElement("div");
    dot.className = "cw-typing";
    dot.id = "cwTypingIndicator";
    dot.setAttribute("aria-label", "Assistant is typing");
    for (let i = 0; i < 3; i++) dot.appendChild(document.createElement("span"));
    messages.appendChild(dot);
    scrollToBottom();
  }

  function hideTyping() {
    const dot = document.getElementById("cwTypingIndicator");
    if (dot) dot.remove();
  }

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function setBusy(busy) {
    isBusy = busy;
    sendBtn.disabled = busy || input.value.trim().length === 0;
    input.disabled = busy;
  }

  /* ── Core request ────────────────────────────────────────────────────── */
  function submitQuestion() {
    const question = input.value.trim();
    if (!question || isBusy) return;

    // Save and render user message
    addMessage(question, "user", 0);

    input.value = "";
    input.style.height = "auto";
    sendBtn.disabled = true;
    setBusy(true);
    showTyping();

    // Re-read CSRF token before each request in case it was refreshed
    fetchCsrfToken();

    fetch("/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify({ question: question }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .then(function (result) {
        hideTyping();
        if (!result.ok) {
          const errMsg =
            (result.data && result.data.error) ||
            "Something went wrong. Please try again.";
          addMessage(errMsg, "system", 0);
          return;
        }
        const answer      = (result.data && result.data.answer)      || "";
        const sourceCount = (result.data && result.data.sourceCount) || 0;
        if (answer) {
          addMessage(answer, "bot", sourceCount);
        } else {
          addMessage("No answer returned. Please rephrase your question.", "system", 0);
        }
      })
      .catch(function () {
        hideTyping();
        addMessage(
          "Could not reach the server. Please check your connection and try again.",
          "system",
          0
        );
      })
      .finally(function () {
        setBusy(false);
      });
  }
})();
