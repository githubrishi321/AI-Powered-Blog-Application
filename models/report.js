const { Schema, model } = require("mongoose");

const reportSchema = new Schema(
  {
    reporter: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    blog: {
      type: Schema.Types.ObjectId,
      ref: "blog",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      enum: ["spam", "promotional", "personal-info", "abusive", "fake", "other"],
      required: true,
    },
    note: {
      type: String,
      maxlength: 300,
      default: "",
    },
    status: {
      type: String,
      enum: ["open", "resolved", "dismissed"],
      default: "open",
      index: true,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Prevent duplicate reports by the same user on the same blog
reportSchema.index({ reporter: 1, blog: 1 }, { unique: true });

const Report = model("report", reportSchema);

module.exports = Report;

