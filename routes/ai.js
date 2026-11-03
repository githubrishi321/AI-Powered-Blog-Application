const express = require("express");
const router = express.Router();
const { convertTone } = require("../services/ai");
const AiLog = require("../models/aiLog");
const { getSettings } = require("../services/settings");

router.post("/tone", async (req, res) => {
  const startTime = Date.now();
  const userId = req.user?._id || null;
  const { text, tone } = req.body;

  try {
    // Check global AI enabled setting
    const settings = await getSettings();
    if (!settings.aiEnabled) {
      await AiLog.create({
        user: userId,
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

    // Check per-user daily limit if set
    const dailyLimit = settings.aiDailyUserLimit || 0;
    if (dailyLimit > 0 && userId) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todayCount = await AiLog.countDocuments({
        user: userId,
        status: "success",
        createdAt: { $gte: startOfDay },
      });
      if (todayCount >= dailyLimit) {
        await AiLog.create({
          user: userId,
          tone,
          inputLength: text.length,
          status: "blocked",
          latencyMs: Date.now() - startTime,
        });
        return res.status(429).json({
          error: `Daily AI usage limit of ${dailyLimit} conversions reached. Try again tomorrow.`,
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
      tone,
      inputLength: text.length,
      status: "success",
      latencyMs,
    });

    res.json({ result });
  } catch (error) {
    console.error("AI Tone Conversion Error:", error);

    try {
      await AiLog.create({
        user: userId,
        tone: tone || "unknown",
        inputLength: text ? text.length : 0,
        status: "error",
        latencyMs: Date.now() - startTime,
      });
    } catch (logErr) {
      console.error("Failed to log AI error:", logErr.message);
    }

    res
      .status(500)
      .json({ error: "Failed to convert tone. Please try again later." });
  }
});

module.exports = router;
