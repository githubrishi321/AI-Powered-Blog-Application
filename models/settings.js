const mongoose = require("mongoose");

// Singleton site-settings document
const settingsSchema = new mongoose.Schema(
  {
    siteName: {
      type: String,
      default: "Blogify",
    },
    registrationsOpen: {
      type: Boolean,
      default: true,
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
    maxUploadSizeBytes: {
      type: Number,
      default: 5 * 1024 * 1024, // 5 MB
    },
    allowedImageTypes: {
      type: [String],
      default: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    },
    defaultNewUserRole: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
    },
    // AI feature flags
    aiEnabled: {
      type: Boolean,
      default: true,
    },
    aiStructureEnabled: {
      type: Boolean,
      default: true,
    },
    aiTones: {
      type: Map,
      of: new mongoose.Schema(
        {
          enabled: { type: Boolean, default: true },
          systemPrompt: { type: String },
        },
        { _id: false }
      ),
      default: () => new Map(),
    },
    aiModel: {
      type: String,
      default: "openai/gpt-oss-120b",
    },
    aiMaxInputLength: {
      type: Number,
      default: 5000,
    },
    aiDailyUserLimit: {
      type: Number,
      default: 0, // 0 = unlimited
    },
  },
  { timestamps: true }
);

const Settings = mongoose.model("settings", settingsSchema);
module.exports = Settings;

