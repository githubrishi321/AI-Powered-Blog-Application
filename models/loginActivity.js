const mongoose = require("mongoose");

const loginActivitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    default: null,
  },
  emailAttempted: {
    type: String,
    required: true,
  },
  success: {
    type: Boolean,
    required: true,
  },
  ip: {
    type: String,
  },
  userAgent: {
    type: String,
  },
  failReason: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

const LoginActivity = mongoose.model("loginactivity", loginActivitySchema);
module.exports = LoginActivity;

