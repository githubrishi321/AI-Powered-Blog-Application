const { Router } = require("express");
const router = Router();
const AuditLog = require("../../models/auditLog");

// GET /admin/audit-log — read-only, no delete from UI
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 30;
    const skip = (page - 1) * limit;
    const { action, targetType, adminId } = req.query;

    const query = {};
    if (action) query.action = new RegExp(action, "i");
    if (targetType) query.targetType = targetType;
    if (adminId) query.admin = adminId;

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("admin", "fullName email"),
      AuditLog.countDocuments(query),
    ]);

    res.render("admin/auditLog/index", {
      user: req.user,
      logs,
      total,
      page,
      pages: Math.ceil(total / limit),
      query: req.query,
      flash: req.flash ? req.flash() : {},
    });
  } catch (err) {
    res.status(500).render("error", { user: req.user, message: "Failed to load audit log." });
  }
});

module.exports = router;

