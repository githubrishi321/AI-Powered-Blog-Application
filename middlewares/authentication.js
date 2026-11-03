const { validateToken } = require("../services/authentication");
const User = require("../models/user");

function checkForAuthenticationCookie(cookieName) {
  return async (req, res, next) => {
    const tokenCookieValue = req.cookies[cookieName];
    if (!tokenCookieValue) {
      return next();
    }

    try {
      const userPayload = validateToken(tokenCookieValue);

      // DB check: verify tokenVersion, status, and lock
      const dbUser = await User.findById(userPayload._id).select(
        "tokenVersion status lockUntil role fullName email profileImageURL"
      );

      if (!dbUser) {
        // User was deleted — clear cookie
        res.clearCookie(cookieName);
        return next();
      }

      // Session invalidation check (password reset / force logout / ban)
      if ((dbUser.tokenVersion || 0) !== (userPayload.tokenVersion || 0)) {
        res.clearCookie(cookieName);
        return next();
      }

      // Status check — banned or suspended users are blocked
      if (dbUser.status === "banned" || dbUser.status === "suspended") {
        res.clearCookie(cookieName);
        return next();
      }

      // Account lockout check
      if (dbUser.lockUntil && dbUser.lockUntil > Date.now()) {
        res.clearCookie(cookieName);
        return next();
      }

      // Attach up-to-date payload (use JWT payload data + refreshed critical fields from DB)
      req.user = {
        _id: userPayload._id,
        email: dbUser.email,
        fullName: dbUser.fullName,
        profileImageURL: dbUser.profileImageURL,
        role: dbUser.role,
        tokenVersion: dbUser.tokenVersion,
        status: dbUser.status,
      };
    } catch (err) {
      // Token is invalid or expired - silently fail and continue without user
      // This allows the request to proceed, but req.user will be undefined
      if (process.env.NODE_ENV === "development") {
        console.log("Token validation failed:", err.message);
      }
    }
    next();
  };
}

function isAuthenticated(req, res, next) {
  if (!req.user) {
    return res.redirect("/user/signin");
  }
  next();
}

module.exports = { checkForAuthenticationCookie, isAuthenticated };
