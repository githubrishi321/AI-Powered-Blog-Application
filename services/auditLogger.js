const AuditLog = require("../models/auditLog");

/**
 * Log an admin action to the audit trail.
 * IMPORTANT: Never include passwords, hashes, salts, JWT secrets, or API keys
 * in the before/after fields.
 *
 * @param {object} opts
 * @param {object} opts.admin     - req.user object of the admin performing the action
 * @param {string} opts.action    - e.g. "user.ban", "blog.delete", "settings.update"
 * @param {string} opts.targetType - e.g. "user", "blog", "comment", "settings"
 * @param {string} opts.targetId   - MongoDB ObjectId string of the target
 * @param {string} opts.targetLabel - Human-readable label (email, blog title, etc.)
 * @param {object} opts.before     - Snapshot of relevant fields before the change
 * @param {object} opts.after      - Snapshot of relevant fields after the change
 * @param {string} opts.ip         - IP address of the admin request
 */
async function logAudit(opts) {
  try {
    const { admin, action, targetType, targetId, targetLabel, before, after, ip } = opts;

    // Strip any sensitive fields before writing
    const sanitize = (obj) => {
      if (!obj) return obj;
      const FORBIDDEN = ["password", "salt", "tokenVersion", "JWT_SECRET", "GROQ_API_KEY", "PASSWORD_SALT"];
      const clean = { ...obj };
      FORBIDDEN.forEach((k) => delete clean[k]);
      return clean;
    };

    await AuditLog.create({
      admin: admin._id,
      adminEmail: admin.email,
      action,
      targetType,
      targetId: targetId ? String(targetId) : undefined,
      targetLabel,
      before: sanitize(before),
      after: sanitize(after),
      ip,
    });
  } catch (err) {
    // Audit log failure must never break the main action
    console.error("Audit log write failed:", err.message);
  }
}

module.exports = { logAudit };

