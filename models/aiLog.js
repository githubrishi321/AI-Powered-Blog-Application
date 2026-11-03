const mongoose = require("mongoose");

const aiLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    default: null,
  },
  tone: {
    type: String,
    required: true,
  },
  inputLength: {
    type: Number,
  },
  status: {
    type: String,
    enum: ["success", "error", "blocked"],
    default: "success",
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

