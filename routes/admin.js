const { Router } = require("express");
const router = Router();
const requireAdmin = require("../middlewares/requireAdmin");
const { getOpenReportsCount } = require("../services/moderation");

// All admin sub-routes inherit requireAdmin
router.use(requireAdmin);

// Provide shared locals to all admin views
router.use(async (req, res, next) => {
  res.locals.user = req.user;
  res.locals.flash = req.flash ? req.flash() : {};
  try {
    res.locals.openReportsBadgeCount = await getOpenReportsCount();
  } catch (_) {
    res.locals.openReportsBadgeCount = 0;
  }
  next();
});

router.use("/dashboard", require("./admin/dashboard"));
router.use("/reports", require("./admin/reports"));
router.use("/users", require("./admin/users"));
router.use("/blogs", require("./admin/blogs"));
router.use("/companies", require("./admin/companies"));
router.use("/comments", require("./admin/comments"));
router.use("/ai", require("./admin/ai"));
router.use("/settings", require("./admin/settings"));
router.use("/login-activity", require("./admin/loginActivity"));
router.use("/audit-log", require("./admin/auditLog"));

// Default redirect
router.get("/", (req, res) => res.redirect("/admin/dashboard"));

module.exports = router;

