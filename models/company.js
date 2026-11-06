const { Schema, model } = require("mongoose");

const companySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    aliases: [
      {
        type: String,
        trim: true,
      },
    ],
    normalizedKey: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    mergedInto: {
      type: Schema.Types.ObjectId,
      ref: "company",
      default: null,
      index: true,
    },
    mergedAt: {
      type: Date,
      default: null,
    },
    previousSlugs: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    isDemo: {
      type: Boolean,
      default: false,
      index: true,
    },
    demoKey: {
      type: String,
      sparse: true,
      unique: true,
    },
  },
  { timestamps: true }
);

// Helpful indexes for alias, slug and merge lookups
companySchema.index({ aliases: 1 });
companySchema.index({ previousSlugs: 1 });

const Company = model("company", companySchema);

module.exports = Company;

