const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");
const {
  convertTone,
  getStartOfDayIST,
  structureInterviewNotes,
  parseAndSanitizeStructuredOutput,
} = require("../services/ai");
const {
  sanitizeString,
  redactContactInfoWithCount,
} = require("../services/experienceInput");
const AiLog = require("../models/aiLog");
const { getSettings } = require("../services/settings");
const { doubleCsrfProtection } = require("../middlewares/csrf");

// Helper: Detect whether an error indicates the requested model was rejected by Groq
function isModelNotFoundError(err) {
  if (!err) return false;
  const status = err.status || err.statusCode;
  if (status === 404) return true;
  if (err.code === "model_not_found" || err.error?.code === "model_not_found") return true;
  if ((status === 400 || status === 403) && typeof err.message === "string") {
    const msg = err.message.toLowerCase();
    if (msg.includes("model")) {
      const patterns = ["does not exist", "not found", "decommissioned", "deprecated", "do not have access"];
      return patterns.some((p) => msg.includes(p));
    }
  }
  return false;
}

// Helper: Require authentication for API endpoints (returns 401 JSON)
function requireApiAuth(req, res, next) {
  if (!req.user || !req.user._id) {
    return res.status(401).json({ error: "Please sign in to use this AI feature." });
  }
  next();
}

// Rate limiter for Structure My Notes: 6 requests per 10 minutes per user
const structureLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 6,
  message: { error: "Too many structure requests. Please wait a few minutes before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user && req.user._id) {
      return String(req.user._id);
    }
    return req.ip;
  },
});

router.post("/tone", doubleCsrfProtection, async (req, res) => {
  const startTime = Date.now();
  const userId = req.user?._id || null;
  const { text, tone } = req.body;

  try {
    // Check global AI enabled setting
    const settings = await getSettings();
    if (!settings.aiEnabled) {
      await AiLog.create({
        user: userId,
        action: "tone",
        tone: tone || "unknown",
        inputLength: text ? text.length : 0,
        status: "blocked",
        latencyMs: Date.now() - startTime,
      });
      return res.status(503).json({ error: "AI Tone Converter is currently disabled." });
    }

    if (!text || text.trim().length < 10) {
      return res
        .status(400)
        .json({ error: "Text must be at least 10 characters long." });
    }

    if (!tone) {
      return res.status(400).json({ error: "Tone must be provided." });
    }

    // Check per-user daily limit in Asia/Kolkata (IST) timezone
    const dailyLimit = settings.aiDailyUserLimit || 0;
    if (dailyLimit > 0 && userId) {
      const startOfDay = getStartOfDayIST();
      const todayCount = await AiLog.countDocuments({
        user: userId,
        status: "success",
        createdAt: { $gte: startOfDay },
      });
      if (todayCount >= dailyLimit) {
        await AiLog.create({
          user: userId,
          action: "tone",
          tone,
          inputLength: text.length,
          status: "blocked",
          latencyMs: Date.now() - startTime,
        });
        return res.status(429).json({
          error: `Daily AI usage limit of ${dailyLimit} AI requests reached. Try again tomorrow.`,
        });
      }
    }

    const maxInputLength = settings.aiMaxInputLength || 5000;
    if (text.length > maxInputLength) {
      return res.status(400).json({
        error: `Text exceeds maximum allowed length of ${maxInputLength} characters.`,
      });
    }

    const result = await convertTone(text, tone, settings);
    const latencyMs = Date.now() - startTime;

    await AiLog.create({
      user: userId,
      action: "tone",
      tone,
      inputLength: text.length,
      status: "success",
      latencyMs,
    });

    res.json({ result });
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const isModelErr = isModelNotFoundError(error);

    if (isModelErr) {
      console.error(`AI Tone Error [${error.name || "AIError"}]: status ${error.status || error.statusCode || 404}`);
      try {
        await AiLog.create({
          user: userId,
          action: "tone",
          tone: tone || "unknown",
          inputLength: text ? text.length : 0,
          status: "error",
          errorCode: "model_not_found",
          latencyMs,
        });
      } catch (logErr) {}
      return res.status(503).json({
        error: "The AI model is currently unavailable. Please try again later.",
      });
    }

    if (error.code === "OUTPUT_TRUNCATED") {
      console.error(`AI Tone Error [OUTPUT_TRUNCATED]: status 502`);
      try {
        await AiLog.create({
          user: userId,
          action: "tone",
          tone: tone || "unknown",
          inputLength: text ? text.length : 0,
          status: "error",
          errorCode: "truncated",
          latencyMs,
        });
      } catch (logErr) {}
      return res.status(502).json({
        error: "AI output was cut off due to length limits. Please try again with shorter text.",
      });
    }

    if (error.code === "ETIMEDOUT") {
      console.error(`AI Tone Error [ETIMEDOUT]: status 503`);
      try {
        await AiLog.create({
          user: userId,
          action: "tone",
          tone: tone || "unknown",
          inputLength: text ? text.length : 0,
          status: "error",
          errorCode: "timeout",
          latencyMs,
        });
      } catch (logErr) {}
      return res.status(503).json({
        error: "AI service request timed out after 20 seconds. Please try again later.",
      });
    }

    console.error(`AI Tone Error [${error.name || "Error"}]: status ${error.status || error.statusCode || 500}`);
    try {
      await AiLog.create({
        user: userId,
        action: "tone",
        tone: tone || "unknown",
        inputLength: text ? text.length : 0,
        status: "error",
        errorCode: "upstream",
        latencyMs,
      });
    } catch (logErr) {}

    res.status(error.status || 500).json({ error: "Failed to convert tone. Please try again later." });
  }
});

// ─── POST /ai/structure (Structure Interview Notes) ──────────────────────────
router.post(
  "/structure",
  requireApiAuth,
  doubleCsrfProtection,
  structureLimiter,
  async (req, res) => {
    const startTime = Date.now();
    const userId = req.user._id;

    try {
      // 1. Feature flag checks
      const settings = await getSettings();
      if (!settings.aiEnabled || settings.aiStructureEnabled === false) {
        const inputLen = typeof req.body.notes === "string" ? req.body.notes.length : 0;
        await AiLog.create({
          user: userId,
          action: "structure",
          inputLength: inputLen,
          status: "blocked",
          latencyMs: Date.now() - startTime,
        });
        return res.status(503).json({
          error: "Structure my notes feature is currently disabled.",
        });
      }

      // 2. Input validation
      const { notes } = req.body;
      if (typeof notes !== "string") {
        return res.status(400).json({
          error: "Notes must be provided as a text string.",
        });
      }

      const sanitizedNotes = sanitizeString(notes);
      if (sanitizedNotes.length < 80) {
        return res.status(400).json({
          error: "Please provide at least 80 characters of interview notes to structure.",
        });
      }

      if (sanitizedNotes.length > 6000) {
        return res.status(400).json({
          error: "Notes exceed the maximum allowed length of 6000 characters.",
        });
      }

      // 3. Shared daily limit check (Asia/Kolkata timezone)
      const dailyLimit = settings.aiDailyUserLimit || 0;
      if (dailyLimit > 0) {
        const startOfDay = getStartOfDayIST();
        const todayCount = await AiLog.countDocuments({
          user: userId,
          status: "success",
          createdAt: { $gte: startOfDay },
        });

        if (todayCount >= dailyLimit) {
          await AiLog.create({
            user: userId,
            action: "structure",
            inputLength: sanitizedNotes.length,
            status: "blocked",
            latencyMs: Date.now() - startTime,
          });
          return res.status(429).json({
            error: `Daily AI usage limit of ${dailyLimit} AI requests reached. Try again tomorrow.`,
          });
        }
      }

      // 4. Redaction of emails, phone numbers, and links
      const { redactedText, redactedCount } = redactContactInfoWithCount(sanitizedNotes);

      // 5. Call AI service & sanitize model output
      try {
        const rawModelOutput = await structureInterviewNotes(redactedText, settings);
        const result = parseAndSanitizeStructuredOutput(rawModelOutput, redactedCount, redactedText);
        const latencyMs = Date.now() - startTime;

        await AiLog.create({
          user: userId,
          action: "structure",
          inputLength: sanitizedNotes.length,
          status: "success",
          latencyMs,
        });

        return res.json(result);
      } catch (aiErr) {
        const latencyMs = Date.now() - startTime;
        const isModelErr = isModelNotFoundError(aiErr);

        if (isModelErr) {
          console.error(`AI Structure Error [${aiErr.name || "AIError"}]: status ${aiErr.status || aiErr.statusCode || 404}`);
          await AiLog.create({
            user: userId,
            action: "structure",
            inputLength: sanitizedNotes.length,
            status: "error",
            errorCode: "model_not_found",
            latencyMs,
          });
          return res.status(503).json({
            error: "The AI model is currently unavailable. Please try again later.",
          });
        }

        if (aiErr.code === "OUTPUT_TRUNCATED") {
          console.error(`AI Structure Error [OUTPUT_TRUNCATED]: status 502`);
          await AiLog.create({
            user: userId,
            action: "structure",
            inputLength: sanitizedNotes.length,
            status: "error",
            errorCode: "truncated",
            latencyMs,
          });
          return res.status(502).json({
            error: "AI output was cut off due to length limits. Please provide shorter notes.",
          });
        }

        if (aiErr.code === "ALL_FIELDS_NULL") {
          console.error(`AI Structure Error [ALL_FIELDS_NULL]: status 422`);
          await AiLog.create({
            user: userId,
            action: "structure",
            inputLength: sanitizedNotes.length,
            status: "error",
            errorCode: "invalid_json",
            latencyMs,
          });
          return res.status(422).json({
            error: "Could not extract structured interview information from the provided notes. Please provide more detailed notes.",
          });
        }

        if (aiErr.code === "INVALID_JSON") {
          console.error(`AI Structure Error [INVALID_JSON]: status 422`);
          await AiLog.create({
            user: userId,
            action: "structure",
            inputLength: sanitizedNotes.length,
            status: "error",
            errorCode: "invalid_json",
            latencyMs,
          });
          return res.status(422).json({
            error: "Unable to parse AI response. Please try again.",
          });
        }

        if (aiErr.code === "ETIMEDOUT") {
          console.error(`AI Structure Error [ETIMEDOUT]: status 503`);
          await AiLog.create({
            user: userId,
            action: "structure",
            inputLength: sanitizedNotes.length,
            status: "error",
            errorCode: "timeout",
            latencyMs,
          });
          return res.status(503).json({
            error: "AI service request timed out after 20 seconds. Please try again later.",
          });
        }

        const errStatus = aiErr.status || aiErr.statusCode || 502;
        console.error(`AI Structure Error [${aiErr.name || "AIError"}]: status ${errStatus}`);
        await AiLog.create({
          user: userId,
          action: "structure",
          inputLength: sanitizedNotes.length,
          status: "error",
          errorCode: "upstream",
          latencyMs,
        });
        return res.status(502).json({
          error: "AI service is currently unavailable. Please try again later.",
        });
      }
    } catch (unexpectedErr) {
      console.error(`AI Structure Unexpected Error [${unexpectedErr.name || "Error"}]: status 500`);
      const latencyMs = Date.now() - startTime;
      try {
        await AiLog.create({
          user: userId,
          action: "structure",
          inputLength: typeof req.body.notes === "string" ? req.body.notes.length : 0,
          status: "error",
          errorCode: "upstream",
          latencyMs,
        });
      } catch (logErr) {
        // Ignore secondary logging error
      }
      return res.status(500).json({
        error: "An unexpected error occurred while structuring your notes. Please try again.",
      });
    }
  }
);

module.exports = router;
