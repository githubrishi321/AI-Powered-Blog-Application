const mongoose = require("mongoose");

const aiLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    default: null,
  },
  tone: {
    type: String,
    required: false,
  },
  action: {
    type: String,
    enum: ["tone", "structure", "search", "ask", "moderation"],
    default: "tone",
  },
  inputLength: {
    type: Number,
  },
  status: {
    type: String,
    enum: ["success", "error", "blocked"],
    default: "success",
  },
  errorCode: {
    type: String,
    default: null,
  },
  latencyMs: {
    type: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

const AiLog = mongoose.model("ailog", aiLogSchema);
module.exports = AiLog;

