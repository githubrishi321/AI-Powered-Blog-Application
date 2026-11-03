const { Router } = require("express");
const router = Router();
const Settings = require("../../models/settings");
const { getSettings, invalidateCache } = require("../../services/settings");
const { logAudit } = require("../../services/auditLogger");

function getIP(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

// GET /admin/settings
router.get("/", async (req, res) => {
  try {
    const settings = await getSettings();
    res.render("admin/settings/index", {
      user: req.user,
      settings,
      flash: req.flash ? req.flash() : {},
    });
  } catch (err) {
    res.status(500).render("error", { user: req.user, message: "Failed to load settings." });
  }
});

// POST /admin/settings/save
router.post("/save", async (req, res) => {
  try {
    const before = await getSettings();

    const updates = {
      siteName: req.body.siteName?.trim() || "Blogify",
      registrationsOpen: req.body.registrationsOpen === "on",
      maintenanceMode: req.body.maintenanceMode === "on",
      maxUploadSizeBytes: parseInt(req.body.maxUploadSizeMB || "5") * 1024 * 1024,
      defaultNewUserRole: ["USER", "ADMIN"].includes(req.body.defaultNewUserRole)
        ? req.body.defaultNewUserRole
        : "USER",
    };

    // Allowed image types
    if (req.body.allowedImageTypes) {
      const types = Array.isArray(req.body.allowedImageTypes)
        ? req.body.allowedImageTypes
        : [req.body.allowedImageTypes];
      updates.allowedImageTypes = types;
    }

    let settings = await Settings.findOne({});
    if (!settings) settings = new Settings({});
    Object.assign(settings, updates);
    await settings.save();
    invalidateCache();

    await logAudit({
      admin: req.user,
      action: "settings.update",
      targetType: "settings",
      targetLabel: "Site Settings",
      before: {
        siteName: before.siteName,
        registrationsOpen: before.registrationsOpen,
        maintenanceMode: before.maintenanceMode,
      },
      after: {
        siteName: updates.siteName,
        registrationsOpen: updates.registrationsOpen,
        maintenanceMode: updates.maintenanceMode,
      },
      ip: getIP(req),
    });

    if (req.flash) req.flash("success", "Settings saved.");
    res.redirect("/admin/settings");
  } catch (err) {
    console.error(err);
    if (req.flash) req.flash("error", "Failed to save settings.");
    res.redirect("/admin/settings");
  }
});

module.exports = router;

