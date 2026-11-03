const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  adminEmail: {
    type: String,
  },
  action: {
    type: String,
    required: true,
    // e.g. "user.ban", "user.delete", "blog.hide", "settings.update", "password.reset"
  },
  targetType: {
    type: String,
    // e.g. "user", "blog", "comment", "settings", "aiConfig"
  },
  targetId: {
    type: String,
  },
  targetLabel: {
    type: String,
    // Human-readable label (email, title, etc.) — never secrets
  },
  // JSON summary of before/after — MUST NOT include passwords, hashes, salts, keys
  before: {
    type: mongoose.Schema.Types.Mixed,
  },
  after: {
    type: mongoose.Schema.Types.Mixed,
  },
  ip: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

const AuditLog = mongoose.model("auditlog", auditLogSchema);
module.exports = AuditLog;

