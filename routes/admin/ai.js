const { Router } = require("express");
const router = Router();
const Settings = require("../../models/settings");
const AiLog = require("../../models/aiLog");
const { getSettings, invalidateCache } = require("../../services/settings");
const { logAudit } = require("../../services/auditLogger");
const { DEFAULT_TONE_PROMPTS, getStartOfDayIST, RETIRED_MODELS } = require("../../services/ai");

function getIP(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

const TONES = ["professional", "casual", "social", "polite", "emojify"];

// GET /admin/ai — AI config page
router.get("/", async (req, res) => {
  try {
    const settings = await getSettings();

    // Build tone config map with defaults
    const toneConfigs = {};
    for (const tone of TONES) {
      const stored = settings.aiTones instanceof Map
        ? settings.aiTones.get(tone)
        : settings.aiTones?.[tone];
      toneConfigs[tone] = {
        enabled: stored?.enabled !== false,
        systemPrompt: stored?.systemPrompt || DEFAULT_TONE_PROMPTS[tone] || "",
      };
    }

    // Usage stats: per tone, per day (last 7 days), matching action: "tone" or legacy unmigrated rows where action does not exist
    const now = new Date();
    const start7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const startOfDay = getStartOfDayIST(now);

    const toneStats = await AiLog.aggregate([
      {
        $match: {
          status: "success",
          $or: [{ action: "tone" }, { action: { $exists: false } }],
          createdAt: { $gte: start7d },
        },
      },
      { $group: { _id: "$tone", count: { $sum: 1 } } },
    ]);

    const toneUsage = {};
    for (const ts of toneStats) toneUsage[ts._id] = ts.count;

    const totalToday = await AiLog.countDocuments({
      createdAt: { $gte: startOfDay },
    });

    // Structure notes usage stats
    const [structureToday, structureSuccess7d, structureError7d] = await Promise.all([
      AiLog.countDocuments({ action: "structure", createdAt: { $gte: startOfDay } }),
      AiLog.countDocuments({ action: "structure", status: "success", createdAt: { $gte: start7d } }),
      AiLog.countDocuments({ action: "structure", status: "error", createdAt: { $gte: start7d } }),
    ]);

    const structureStats = {
      today: structureToday,
      success7d: structureSuccess7d,
      error7d: structureError7d,
    };

    // Check if any AI call in the last 24 hours failed with model_not_found
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const hasModelRejected = Boolean(
      await AiLog.exists({
        errorCode: "model_not_found",
        createdAt: { $gte: last24h },
      })
    );

    // Check if stored model is retired
    let retiredModelNotice = null;
    if (settings.aiModel && RETIRED_MODELS[settings.aiModel]) {
      retiredModelNotice = {
        stored: settings.aiModel,
        replacement: RETIRED_MODELS[settings.aiModel],
      };
    }

    res.render("admin/ai/control", {
      user: req.user,
      settings,
      toneConfigs,
      tones: TONES,
      toneUsage,
      totalToday,
      structureStats,
      hasModelRejected,
      retiredModelNotice,
      // Show GROQ_API_KEY only as configured: yes/no — never the actual key
      groqConfigured: !!process.env.GROQ_API_KEY,
      flash: req.flash ? req.flash() : {},
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("error", { user: req.user, message: "Failed to load AI settings." });
  }
});

// POST /admin/ai/save
router.post("/save", async (req, res) => {
  try {
    const currentSettings = await getSettings();
    const before = {
      aiEnabled: currentSettings.aiEnabled,
      aiStructureEnabled: currentSettings.aiStructureEnabled !== false,
      aiModel: currentSettings.aiModel,
      aiMaxInputLength: currentSettings.aiMaxInputLength,
      aiDailyUserLimit: currentSettings.aiDailyUserLimit,
    };

    const aiEnabled = req.body.aiEnabled === "on" || req.body.aiEnabled === "true" || req.body.aiEnabled === "1";
    const aiStructureEnabled = req.body.aiStructureEnabled === "on" || req.body.aiStructureEnabled === "true" || req.body.aiStructureEnabled === "1";
    const aiModel = req.body.aiModel?.trim() || "openai/gpt-oss-120b";
    const aiMaxInputLength = parseInt(req.body.aiMaxInputLength) || 5000;
    const aiDailyUserLimit = parseInt(req.body.aiDailyUserLimit) || 0;

    // Build tone map
    const aiTones = {};
    for (const tone of TONES) {
      aiTones[tone] = {
        enabled: req.body[`tone_${tone}_enabled`] === "on",
        systemPrompt: req.body[`tone_${tone}_prompt`]?.trim() || DEFAULT_TONE_PROMPTS[tone],
      };
    }

    let settings = await Settings.findOne({});
    if (!settings) settings = new Settings({});
    settings.aiEnabled = aiEnabled;
    settings.aiStructureEnabled = aiStructureEnabled;
    settings.aiModel = aiModel;
    settings.aiMaxInputLength = aiMaxInputLength;
    settings.aiDailyUserLimit = aiDailyUserLimit;
    settings.aiTones = aiTones;
    await settings.save();
    invalidateCache();

    await logAudit({
      admin: req.user,
      action: "aiConfig.update",
      targetType: "settings",
      targetLabel: "AI Configuration",
      before,
      after: { aiEnabled, aiStructureEnabled, aiModel, aiMaxInputLength, aiDailyUserLimit },
      ip: getIP(req),
    });

    if (req.flash) req.flash("success", "AI settings saved.");
    res.redirect("/admin/ai");
  } catch (err) {
    console.error(err);
    if (req.flash) req.flash("error", "Failed to save AI settings.");
    res.redirect("/admin/ai");
  }
});

// GET /admin/ai/logs
router.get("/logs", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 30;
    const skip = (page - 1) * limit;
    const { tone, status, userId } = req.query;

    const query = {};
    if (tone && tone !== "all") query.tone = tone;
    if (status && status !== "all") query.status = status;
    if (userId) query.user = userId;

    const [logs, total] = await Promise.all([
      AiLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("user", "fullName email"),
      AiLog.countDocuments(query),
    ]);

    res.render("admin/ai/logs", {
      user: req.user,
      logs,
      total,
      page,
      pages: Math.ceil(total / limit),
      query: req.query,
      tones: TONES,
      flash: req.flash ? req.flash() : {},
    });
  } catch (err) {
    res.status(500).render("error", { user: req.user, message: "Failed to load AI logs." });
  }
});

module.exports = router;

