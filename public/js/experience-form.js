/**
 * Client-Side Script for Experience Authoring Form
 *
 * Rules:
 * - Strict Helmet CSP compliance (no inline handlers, no inline styles)
 * - Dynamic round addition/removal (cloned from <template id="roundTemplate">)
 * - Dynamic question addition/removal (cloned from <template id="questionTemplate">)
 * - Strict limits enforcement (max 10 rounds, max 15 questions per round)
 * - Character count indicators
 * - Submit button disabled on submit to prevent double-posts
 */

document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("experienceForm");
  const roundsContainer = document.getElementById("roundsContainer");
  const addRoundBtn = document.getElementById("addRoundBtn");
  const roundTemplate = document.getElementById("roundTemplate");
  const questionTemplate = document.getElementById("questionTemplate");
  const submitBtn = document.getElementById("submitExpBtn");

  if (!form || !roundsContainer || !addRoundBtn || !roundTemplate) return;

  const MAX_ROUNDS = 10;
  const MAX_QUESTIONS_PER_ROUND = 15;

  /**
   * Re-indexes all rounds and questions so names match rounds[0][...], rounds[1][...], etc.
   */
  function reindexRounds() {
    const roundCards = roundsContainer.querySelectorAll(".round-card");
    const count = roundCards.length;

    roundCards.forEach((card, rIdx) => {
      // Header number
      const numSpan = card.querySelector(".round-number-badge");
      if (numSpan) numSpan.textContent = `Round ${rIdx + 1}`;

      // Re-index round-level inputs
      card.querySelectorAll("[data-field]").forEach((el) => {
        const field = el.dataset.field;
        el.name = `rounds[${rIdx}][${field}]`;
        el.id = `rounds_${rIdx}_${field}`;
      });

      // Re-index questions
      const questionItems = card.querySelectorAll(".question-item");
      questionItems.forEach((qItem, qIdx) => {
        const qInput = qItem.querySelector(".question-input");
        if (qInput) {
          qInput.name = `rounds[${rIdx}][questions][${qIdx}]`;
          qInput.id = `rounds_${rIdx}_questions_${qIdx}`;
        }
      });

      // Update question add button state
      const addQBtn = card.querySelector(".btn-add-question");
      if (addQBtn) {
        if (questionItems.length >= MAX_QUESTIONS_PER_ROUND) {
          addQBtn.disabled = true;
          addQBtn.title = "Maximum 15 questions reached";
        } else {
          addQBtn.disabled = false;
          addQBtn.title = "Add Question";
        }
      }

      // Hide remove button if only 1 round remains
      const removeRoundBtn = card.querySelector(".btn-remove-round");
      if (removeRoundBtn) {
        removeRoundBtn.classList.toggle("d-none", count <= 1);
      }
    });

    // Update Add Round button state
    if (addRoundBtn) {
      if (count >= MAX_ROUNDS) {
        addRoundBtn.disabled = true;
        addRoundBtn.textContent = "Max 10 Rounds Reached";
      } else {
        addRoundBtn.disabled = false;
        addRoundBtn.innerHTML = '<i class="fas fa-plus me-1"></i>Add Another Round';
      }
    }
  }

  /**
   * Binds event listeners to a round card (remove, add question, remove question, char counters)
   */
  function bindRoundCardEvents(card) {
    // Remove round
    const removeRoundBtn = card.querySelector(".btn-remove-round");
    if (removeRoundBtn) {
      removeRoundBtn.addEventListener("click", function () {
        if (roundsContainer.querySelectorAll(".round-card").length > 1) {
          card.remove();
          reindexRounds();
        }
      });
    }

    // Add question
    const addQBtn = card.querySelector(".btn-add-question");
    const qList = card.querySelector(".questions-list");
    if (addQBtn && qList && questionTemplate) {
      addQBtn.addEventListener("click", function () {
        if (qList.querySelectorAll(".question-item").length < MAX_QUESTIONS_PER_ROUND) {
          const clone = questionTemplate.content.cloneNode(true);
          const qItem = clone.querySelector(".question-item");
          bindQuestionItemEvents(qItem, card);
          qList.appendChild(clone);
          reindexRounds();
        }
      });
    }

    // Bind existing questions
    card.querySelectorAll(".question-item").forEach((qItem) => {
      bindQuestionItemEvents(qItem, card);
    });

    // Character counter for round description
    const descTextarea = card.querySelector("textarea[data-field='description']");
    const descCounter = card.querySelector(".char-counter-desc");
    if (descTextarea && descCounter) {
      descTextarea.addEventListener("input", function () {
        descCounter.textContent = `${descTextarea.value.length} / 1000`;
        if (descTextarea.value.length > 1000) {
          descCounter.classList.add("text-danger");
        } else {
          descCounter.classList.remove("text-danger");
        }
      });
      descCounter.textContent = `${descTextarea.value.length} / 1000`;
    }
  }

  function bindQuestionItemEvents(qItem, roundCard) {
    const removeQBtn = qItem.querySelector(".btn-remove-question");
    if (removeQBtn) {
      removeQBtn.addEventListener("click", function () {
        qItem.remove();
        reindexRounds();
      });
    }
  }

  // Bind existing rounds on page load
  roundsContainer.querySelectorAll(".round-card").forEach((card) => {
    bindRoundCardEvents(card);
  });

  // If no rounds present (fresh page), add one default round
  if (roundsContainer.querySelectorAll(".round-card").length === 0) {
    const defaultRound = roundTemplate.content.cloneNode(true);
    const card = defaultRound.querySelector(".round-card");
    bindRoundCardEvents(card);
    roundsContainer.appendChild(defaultRound);
  }

  reindexRounds();

  /**
   * Helper exposed on window to populate rounds from structured AI data.
   * Clears existing rounds and builds round cards from templates.
   */
  window.populateExperienceRounds = function (rounds) {
    if (!Array.isArray(rounds) || rounds.length === 0) return [];

    // Clear existing round cards
    roundsContainer.innerHTML = "";

    const addedCards = [];
    const roundsToProcess = rounds.slice(0, MAX_ROUNDS);

    roundsToProcess.forEach((roundData) => {
      const clone = roundTemplate.content.cloneNode(true);
      const card = clone.querySelector(".round-card");

      // Set round type
      const typeSelect = card.querySelector("[data-field='type']");
      if (typeSelect && roundData.type) {
        typeSelect.value = roundData.type;
      }

      // Set duration
      const durInput = card.querySelector("[data-field='durationMinutes']");
      if (durInput && roundData.durationMinutes != null) {
        durInput.value = roundData.durationMinutes;
      }

      // Set description
      const descTextarea = card.querySelector("[data-field='description']");
      if (descTextarea && roundData.description) {
        descTextarea.value = roundData.description;
        const counter = card.querySelector(".char-counter-desc");
        if (counter) {
          counter.textContent = `${descTextarea.value.length} / 1000`;
        }
      }

      // Populate questions
      const qList = card.querySelector(".questions-list");
      if (qList && questionTemplate) {
        qList.innerHTML = ""; // Clear default template question
        const questions = Array.isArray(roundData.questions)
          ? roundData.questions.slice(0, MAX_QUESTIONS_PER_ROUND)
          : [];
        if (questions.length > 0) {
          questions.forEach((qText) => {
            const qClone = questionTemplate.content.cloneNode(true);
            const qItem = qClone.querySelector(".question-item");
            const qInput = qItem.querySelector(".question-input");
            if (qInput) qInput.value = qText;
            bindQuestionItemEvents(qItem, card);
            qList.appendChild(qClone);
          });
        } else {
          const qClone = questionTemplate.content.cloneNode(true);
          const qItem = qClone.querySelector(".question-item");
          bindQuestionItemEvents(qItem, card);
          qList.appendChild(qClone);
        }
      }

      bindRoundCardEvents(card);
      roundsContainer.appendChild(clone);
      addedCards.push(card);
    });

    reindexRounds();
    return addedCards;
  };

  // Add Round button click
  addRoundBtn.addEventListener("click", function () {
    if (roundsContainer.querySelectorAll(".round-card").length < MAX_ROUNDS) {
      const clone = roundTemplate.content.cloneNode(true);
      const card = clone.querySelector(".round-card");
      bindRoundCardEvents(card);
      roundsContainer.appendChild(clone);
      reindexRounds();
    }
  });

  // Global char counters for Tips and Story
  function bindGlobalCounter(textareaId, counterId, maxLen) {
    const el = document.getElementById(textareaId);
    const counter = document.getElementById(counterId);
    if (el && counter) {
      el.addEventListener("input", function () {
        counter.textContent = `${el.value.length} / ${maxLen}`;
        if (el.value.length > maxLen) {
          counter.classList.add("text-danger");
        } else {
          counter.classList.remove("text-danger");
        }
      });
      counter.textContent = `${el.value.length} / ${maxLen}`;
    }
  }

  bindGlobalCounter("tipsInput", "tipsCounter", 2000);
  bindGlobalCounter("storyInput", "storyCounter", 5000);

  // Submit Guard: Disable button on submit to avoid duplicate submissions
  form.addEventListener("submit", function () {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML =
        '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Publishing Experience...';
    }
  });
});

