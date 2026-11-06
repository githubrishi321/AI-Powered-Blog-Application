/**
 * services/experienceInput.js
 *
 * Centralized service for interview experience payload parsing, sanitization,
 * contact info detection & redaction, and strict validation.
 */

// ─── Cap Constants ──────────────────────────────────────────────────────────
const MAX_ROLE_LENGTH = 100;
const MAX_TIPS_LENGTH = 2000;
const MAX_STORY_LENGTH = 5000;
const MAX_ROUNDS = 10;
const MAX_ROUND_QUESTIONS = 20;
const MAX_QUESTION_LENGTH = 500;
const MAX_ROUND_NAME_LENGTH = 100;
const MAX_ROUND_DURATION_LENGTH = 50;
const MAX_ROUND_DESCRIPTION_LENGTH = 1000;

const VALID_DRIVE_TYPES = ["on-campus", "off-campus", "internship"];
const VALID_OUTCOMES = ["selected", "rejected", "waiting", "undisclosed"];
const VALID_ROUND_TYPES = ["aptitude", "coding", "technical", "gd", "hr", "other"];
const VALID_REPORT_REASONS = ["spam", "promotional", "personal-info", "abusive", "fake", "other"];

// ─── Sanitization ───────────────────────────────────────────────────────────
/**
 * Sanitizes input strings:
 * - Converts to string
 * - Normalizes to Unicode NFC
 * - Strips control characters (preserves newlines and tabs)
 * - Collapses spaces and trims
 */
function sanitizeString(val) {
  if (val === null || val === undefined) return "";
  if (typeof val !== "string") val = String(val);
  return val
    .normalize("NFC")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

// ─── Contact Detection Patterns ─────────────────────────────────────────────
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/i;

// Phone: 10-digit Indian numbers with digit boundaries, +91 or 0 prefix, 5-5, 3-3-4, 4-3-3 groupings
const PHONE_REGEX = /(?<!\d)(?:(?:\+91|0|\(\+91\))[\s.-]?)?(?:[6-9]\d{9}|[6-9]\d{4}[\s.-]\d{5}|[6-9]\d{2}[\s.-]\d{3}[\s.-]\d{4}|[6-9]\d{3}[\s.-]\d{3}[\s.-]\d{3})(?!\d)/;

// Links: URLs with http(s), www, specific domain hostnames without slash, and standard domain paths
const LINK_REGEX = /(?:https?:\/\/[^\s]+|\bwww\.[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:[^\s]*)|(?:\b(?:linkedin\.com|github\.com|instagram\.com|t\.me|wa\.me|bit\.ly|discord\.gg)(?:\/[^\s]*)?)|(?:[a-zA-Z0-9-]+\.)+(?:com|org|net|edu|gov|in|co|io|me|dev|app|ai)\/[^\s]*)/i;

/**
 * Checks text for personal contact info (email, phone, link).
 * @param {string} text
 * @returns {{ hasContact: boolean, type: string|null, match: string|null }}
 */
function findContactInfo(text) {
  if (!text || typeof text !== "string") {
    return { hasContact: false, type: null, match: null };
  }

  const emailMatch = text.match(EMAIL_REGEX);
  if (emailMatch) {
    return { hasContact: true, type: "email", match: emailMatch[0] };
  }

  const phoneMatch = text.match(PHONE_REGEX);
  if (phoneMatch) {
    return { hasContact: true, type: "phone", match: phoneMatch[0] };
  }

  const linkMatch = text.match(LINK_REGEX);
  if (linkMatch) {
    return { hasContact: true, type: "link", match: linkMatch[0] };
  }

  return { hasContact: false, type: null, match: null };
}

/**
 * Redacts personal contact info in text by replacing with "[removed]".
 * @param {string} text
 * @returns {string}
 */
function redactContactInfo(text) {
  if (!text || typeof text !== "string") return "";
  const EMAIL_GLOBAL = new RegExp(EMAIL_REGEX.source, "gi");
  const PHONE_GLOBAL = new RegExp(PHONE_REGEX.source, "g");
  const LINK_GLOBAL = new RegExp(LINK_REGEX.source, "gi");
  return text
    .replace(EMAIL_GLOBAL, "[removed]")
    .replace(PHONE_GLOBAL, "[removed]")
    .replace(LINK_GLOBAL, "[removed]");
}

/**
 * Redacts personal contact info in text and returns the count of redacted items.
 * @param {string} text
 * @returns {{ redactedText: string, redactedCount: number }}
 */
function redactContactInfoWithCount(text) {
  if (!text || typeof text !== "string") return { redactedText: "", redactedCount: 0 };
  let count = 0;
  const EMAIL_GLOBAL = new RegExp(EMAIL_REGEX.source, "gi");
  const PHONE_GLOBAL = new RegExp(PHONE_REGEX.source, "g");
  const LINK_GLOBAL = new RegExp(LINK_REGEX.source, "gi");
  let redacted = text.replace(EMAIL_GLOBAL, () => {
    count++;
    return "[removed]";
  });
  redacted = redacted.replace(PHONE_GLOBAL, () => {
    count++;
    return "[removed]";
  });
  redacted = redacted.replace(LINK_GLOBAL, () => {
    count++;
    return "[removed]";
  });
  return { redactedText: redacted, redactedCount: count };
}

function checkProhibitedContent(text, fieldName) {
  const result = findContactInfo(text);
  if (result.hasContact) {
    if (result.type === "email") return `${fieldName} contains an email address. Personal contact info is not allowed.`;
    if (result.type === "phone") return `${fieldName} contains a phone number. Personal contact info is not allowed.`;
    if (result.type === "link") return `${fieldName} contains a web link. External links are not allowed.`;
  }
  return null;
}

/**
 * Validates and parses submission/edit payload.
 * Returns { isValid, errors, parsedData }
 */
function parseAndValidateExperiencePayload(body) {
  const errors = {};

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      isValid: false,
      errors: { general: "Invalid form submission format." },
      parsedData: null,
    };
  }

  // 1. Mandatory noContactDetails confirmation
  const noContactChecked =
    body.noContactDetails === "on" ||
    body.noContactDetails === true ||
    body.noContactDetails === "true";
  if (!noContactChecked) {
    errors.noContactDetails = "You must confirm that no interviewer names or personal contact details are included.";
  }

  // 2. Company Name
  if (typeof body.company !== "string" || !body.company.trim()) {
    errors.company = "Company name is required.";
  }
  const companyName = typeof body.company === "string" ? sanitizeString(body.company) : "";
  if (companyName) {
    const contactErr = checkProhibitedContent(companyName, "Company name");
    if (contactErr) errors.company = contactErr;
  }

  // 3. Role
  if (typeof body.role !== "string" || !body.role.trim()) {
    errors.role = "Role is required.";
  } else if (body.role.trim().length > MAX_ROLE_LENGTH) {
    errors.role = `Role cannot exceed ${MAX_ROLE_LENGTH} characters.`;
  }
  const role = typeof body.role === "string" ? sanitizeString(body.role).slice(0, MAX_ROLE_LENGTH) : "";
  if (role) {
    const contactErr = checkProhibitedContent(role, "Role");
    if (contactErr) errors.role = contactErr;
  }

  // 4. Drive Type
  const driveType = typeof body.driveType === "string" ? body.driveType.trim() : "";
  if (!VALID_DRIVE_TYPES.includes(driveType)) {
    errors.driveType = "Please select a valid drive type (On-Campus, Off-Campus, or Internship).";
  }

  // 5. Year
  const currentYear = new Date().getFullYear();
  const year = parseInt(body.year, 10);
  if (isNaN(year) || year < 2015 || year > currentYear + 1) {
    errors.year = `Year must be between 2015 and ${currentYear + 1}.`;
  }

  // 6. Difficulty
  const difficulty = parseInt(body.difficulty, 10);
  if (isNaN(difficulty) || difficulty < 1 || difficulty > 5) {
    errors.difficulty = "Difficulty must be a number between 1 (Very Easy) and 5 (Very Hard).";
  }

  // 7. Outcome
  const outcome = typeof body.outcome === "string" ? body.outcome.trim() : "undisclosed";
  if (!VALID_OUTCOMES.includes(outcome)) {
    errors.outcome = "Please select a valid interview outcome.";
  }

  // 8. Anonymous flag
  const anonymous = body.anonymous === "on" || body.anonymous === true || body.anonymous === "true";

  // 9. Tips (optional)
  const rawTips = typeof body.tips === "string" ? body.tips : "";
  if (rawTips.length > MAX_TIPS_LENGTH) {
    errors.tips = `Tips cannot exceed ${MAX_TIPS_LENGTH} characters.`;
  }
  const tips = sanitizeString(rawTips).slice(0, MAX_TIPS_LENGTH);
  if (tips) {
    const contactErr = checkProhibitedContent(tips, "Tips");
    if (contactErr) errors.tips = contactErr;
  }

  // 9b. Story (optional)
  const rawStory = typeof body.story === "string" ? body.story : "";
  if (rawStory.length > MAX_STORY_LENGTH) {
    errors.story = `Story cannot exceed ${MAX_STORY_LENGTH} characters.`;
  }
  const story = sanitizeString(rawStory).slice(0, MAX_STORY_LENGTH);
  if (story) {
    const contactErr = checkProhibitedContent(story, "Story");
    if (contactErr) errors.story = contactErr;
  }

  // 10. Rounds validation
  if (!body.rounds || (typeof body.rounds !== "object" && !Array.isArray(body.rounds))) {
    errors.rounds = "Interview rounds are required. Please add at least 1 round.";
  }

  let rawRounds = [];
  if (body.rounds) {
    if (Array.isArray(body.rounds)) {
      rawRounds = body.rounds;
    } else if (typeof body.rounds === "object") {
      const keys = Object.keys(body.rounds);
      const numericKeys = keys.map(Number);
      const maxIndex = Math.max(...numericKeys);
      if (maxIndex >= MAX_ROUNDS || numericKeys.some(isNaN)) {
        errors.rounds = `Maximum ${MAX_ROUNDS} rounds allowed.`;
      } else {
        rawRounds = keys
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => body.rounds[k]);
      }
    } else {
      errors.rounds = "Rounds format is invalid.";
    }
  }

  if (rawRounds.length === 0 && !errors.rounds) {
    errors.rounds = "Please add at least 1 interview round.";
  }
  if (rawRounds.length > MAX_ROUNDS) {
    errors.rounds = `You cannot add more than ${MAX_ROUNDS} interview rounds.`;
  }

  const parsedRounds = [];
  for (let i = 0; i < Math.min(rawRounds.length, MAX_ROUNDS); i++) {
    const r = rawRounds[i];
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      errors.rounds = "Invalid round format.";
      break;
    }

    const roundNumber = i + 1;
    const name = sanitizeString(r.name || `Round ${roundNumber}`).slice(0, MAX_ROUND_NAME_LENGTH);
    if (!name) errors[`round_${i}_name`] = "Round name is required.";
    const nameErr = checkProhibitedContent(name, `Round ${roundNumber} name`);
    if (nameErr) errors[`round_${i}_name`] = nameErr;

    const roundType = typeof r.type === "string" ? r.type.trim() : "other";
    if (!VALID_ROUND_TYPES.includes(roundType)) {
      errors[`round_${i}_type`] = `Please select a valid type for Round ${roundNumber}.`;
    }

    const rawDuration = r.durationMinutes !== undefined && r.durationMinutes !== null && r.durationMinutes !== ""
      ? r.durationMinutes
      : r.duration;
    const duration = sanitizeString(rawDuration || "").slice(0, MAX_ROUND_DURATION_LENGTH);
    const durationErr = checkProhibitedContent(duration, `Round ${roundNumber} duration`);
    if (durationErr) errors[`round_${i}_duration`] = durationErr;

    let durationMinutes = undefined;
    if (rawDuration !== undefined && rawDuration !== null && rawDuration !== "") {
      const dm = parseInt(rawDuration, 10);
      if (!isNaN(dm) && dm > 0) durationMinutes = dm;
    }

    const description = sanitizeString(r.description || "").slice(0, MAX_ROUND_DESCRIPTION_LENGTH);
    const descErr = checkProhibitedContent(description, `Round ${roundNumber} description`);
    if (descErr) errors[`round_${i}_description`] = descErr;

    const roundDiff = parseInt(r.difficulty, 10) || 3;
    const safeRoundDiff = Math.min(5, Math.max(1, roundDiff));

    // Questions parsing
    let rawQuestions = [];
    if (r.questions !== undefined) {
      if (Array.isArray(r.questions)) {
        rawQuestions = r.questions;
      } else if (typeof r.questions === "string" && r.questions.trim()) {
        rawQuestions = [r.questions];
      } else if (typeof r.questions === "object") {
        errors[`round_${i}_questions`] = `Questions in Round ${roundNumber} must be a list of text questions.`;
      }
    }

    const parsedQuestions = [];
    for (let qIdx = 0; qIdx < Math.min(rawQuestions.length, MAX_ROUND_QUESTIONS); qIdx++) {
      const q = rawQuestions[qIdx];
      if (typeof q !== "string") {
        errors[`round_${i}_questions`] = `Questions in Round ${roundNumber} must be text.`;
        continue;
      }
      const sanitizedQ = sanitizeString(q).slice(0, MAX_QUESTION_LENGTH);
      if (sanitizedQ) {
        const qErr = checkProhibitedContent(sanitizedQ, `Round ${roundNumber} question`);
        if (qErr) {
          errors[`round_${i}_question_${qIdx}`] = qErr;
        } else {
          parsedQuestions.push(sanitizedQ);
        }
      }
    }

    parsedRounds.push({
      roundNumber,
      name: name || `Round ${roundNumber}`,
      type: roundType,
      description,
      duration,
      durationMinutes,
      difficulty: safeRoundDiff,
      questions: parsedQuestions,
    });
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    parsedData: {
      companyName,
      role,
      driveType,
      year,
      difficulty,
      outcome,
      anonymous,
      tips,
      story,
      rounds: parsedRounds,
    },
  };
}

module.exports = {
  MAX_ROLE_LENGTH,
  MAX_TIPS_LENGTH,
  MAX_ROUNDS,
  MAX_ROUND_QUESTIONS,
  MAX_QUESTION_LENGTH,
  VALID_DRIVE_TYPES,
  VALID_OUTCOMES,
  VALID_ROUND_TYPES,
  VALID_REPORT_REASONS,
  EMAIL_REGEX,
  PHONE_REGEX,
  LINK_REGEX,
  sanitizeString,
  findContactInfo,
  redactContactInfo,
  redactContactInfoWithCount,
  checkProhibitedContent,
  parseAndValidateExperiencePayload,
};

