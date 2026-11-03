const User = require("../models/user");

/**
 * requireAdmin middleware
 * - Re-checks role and status from database on every request (does NOT trust JWT alone)
 * - Adds Cache-Control: no-store to all admin responses
 * - Redirects unauthenticated users to signin
 * - Returns 403 to authenticated non-admins
 */
async function requireAdmin(req, res, next) {
  // No-store cache headers for all admin pages
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  // Must be authenticated
  if (!req.user) {
    return res.redirect("/user/signin");
  }

  try {
    // Re-read from DB — do not trust the JWT payload for role/status
    const dbUser = await User.findById(req.user._id).select("role status tokenVersion lockUntil");

    if (!dbUser) {
      return res.redirect("/user/signin");
    }

    if (dbUser.status !== "active") {
      return res.redirect("/user/signin");
    }

    if (dbUser.role !== "ADMIN") {
      return res.status(403).render("error", {
        user: req.user,
        message: "Access denied. Admin privileges required.",
      });
    }

    // Attach fresh role to req.user for use in templates
    req.user.role = dbUser.role;
    next();
  } catch (err) {
    console.error("requireAdmin error:", err);
    return res.status(500).render("error", {
      user: req.user,
      message: "Server error during authorization.",
    });
  }
}

module.exports = requireAdmin;

