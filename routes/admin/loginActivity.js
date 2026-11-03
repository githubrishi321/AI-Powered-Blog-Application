const { Router } = require("express");
const router = Router();
const LoginActivity = require("../../models/loginActivity");

// GET /admin/login-activity
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 30;
    const skip = (page - 1) * limit;
    const { success, userId, email } = req.query;

    const query = {};
    if (success === "true") query.success = true;
    else if (success === "false") query.success = false;
    if (userId) query.user = userId;
    if (email) {
      const re = new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.emailAttempted = re;
    }

    const [logs, total] = await Promise.all([
      LoginActivity.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "fullName email"),
      LoginActivity.countDocuments(query),
    ]);

    res.render("admin/loginActivity/index", {
      user: req.user,
      logs,
      total,
      page,
      pages: Math.ceil(total / limit),
      query: req.query,
      flash: req.flash ? req.flash() : {},
    });
  } catch (err) {
    res.status(500).render("error", { user: req.user, message: "Failed to load login activity." });
  }
});

module.exports = router;

