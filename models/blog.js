const { Schema, model } = require("mongoose");

const roundSchema = new Schema(
  {
    roundNumber: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["aptitude", "technical", "coding", "hr", "managerial", "group-discussion", "other"],
      required: true,
    },
    description: {
      type: String,
      maxlength: [1000, "Round description cannot exceed 1000 characters"],
      default: "",
    },
    questions: {
      type: [
        {
          type: String,
          maxlength: [300, "Each question cannot exceed 300 characters"],
        },
      ],
      validate: {
        validator: function (val) {
          return !val || val.length <= 15;
        },
        message: "Maximum 15 questions allowed per round",
      },
      default: [],
    },
    durationMinutes: {
      type: Number,
      required: false,
    },
    difficulty: {
      type: Number,
      min: [1, "Round difficulty must be at least 1"],
      max: [5, "Round difficulty cannot exceed 5"],
      required: false,
    },
  },
  { _id: false }
);

const experienceSchema = new Schema(
  {
    company: {
      type: Schema.Types.ObjectId,
      ref: "company",
      required: [
        function () {
          const root = typeof this.ownerDocument === "function" ? this.ownerDocument() : this;
          return root && root.type === "experience";
        },
        "Company is required for interview experiences",
      ],
    },
    role: {
      type: String,
      maxlength: [100, "Role cannot exceed 100 characters"],
      trim: true,
      required: [
        function () {
          const root = typeof this.ownerDocument === "function" ? this.ownerDocument() : this;
          return root && root.type === "experience";
        },
        "Role is required for interview experiences",
      ],
    },
    driveType: {
      type: String,
      enum: {
        values: ["on-campus", "off-campus", "internship"],
        message: "{VALUE} is not a valid drive type",
      },
      required: [
        function () {
          const root = typeof this.ownerDocument === "function" ? this.ownerDocument() : this;
          return root && root.type === "experience";
        },
        "Drive type is required for interview experiences",
      ],
    },
    year: {
      type: Number,
      validate: {
        validator: function (val) {
          const root = typeof this.ownerDocument === "function" ? this.ownerDocument() : this;
          if (root && root.type !== "experience") return true;
          if (val === undefined || val === null) return false;
          const maxYear = new Date().getFullYear() + 1;
          return val >= 2015 && val <= maxYear;
        },
        message: function () {
          return `Year must be between 2015 and ${new Date().getFullYear() + 1}`;
        },
      },
      required: [
        function () {
          const root = typeof this.ownerDocument === "function" ? this.ownerDocument() : this;
          return root && root.type === "experience";
        },
        "Year is required for interview experiences",
      ],
    },
    rounds: {
      type: [roundSchema],
      validate: {
        validator: function (val) {
          return !val || val.length <= 10;
        },
        message: "Maximum 10 rounds allowed",
      },
      default: [],
    },
    difficulty: {
      type: Number,
      min: [1, "Difficulty must be between 1 and 5"],
      max: [5, "Difficulty must be between 1 and 5"],
      required: [
        function () {
          const root = typeof this.ownerDocument === "function" ? this.ownerDocument() : this;
          return root && root.type === "experience";
        },
        "Difficulty rating (1-5) is required for interview experiences",
      ],
    },
    outcome: {
      type: String,
      enum: {
        values: ["selected", "rejected", "waiting", "undisclosed"],
        message: "{VALUE} is not a valid outcome",
      },
      default: "undisclosed",
      required: [
        function () {
          const root = typeof this.ownerDocument === "function" ? this.ownerDocument() : this;
          return root && root.type === "experience";
        },
        "Outcome is required for interview experiences",
      ],
    },
    tips: {
      type: String,
      maxlength: [2000, "Tips cannot exceed 2000 characters"],
      default: "",
    },
    anonymous: {
      type: Boolean,
      default: false,
    },
    verified: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const blogSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: [
        function () {
          return this.type !== "experience";
        },
        "Body is required for blogs",
      ],
    },
    type: {
      type: String,
      enum: ["blog", "experience"],
      default: "blog",
    },
    experience: {
      type: experienceSchema,
      default: undefined,
    },
    coverImageURL: {
      type: String,
      required: false,
    },
    coverImagePublicId: {
      type: String,
      required: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    // Blog visibility: published | hidden | featured
    status: {
      type: String,
      enum: ["published", "hidden", "featured"],
      default: "published",
    },
    // Moderator hide metadata (admin only, never user-editable, never in public view-models)
    moderationReason: {
      type: String,
      enum: {
        values: ["spam", "promotional", "personal-info", "abusive", "fake", "other", null],
        message: "{VALUE} is not a valid moderation reason",
      },
      default: null,
    },
    moderationNote: {
      type: String,
      maxlength: [200, "Moderation note cannot exceed 200 characters"],
      default: null,
    },
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

// Enforce experience sub-document presence when type === "experience"
blogSchema.pre("validate", function (next) {
  if (this.type === "experience") {
    if (!this.experience) {
      this.invalidate("experience", "Experience object is required when type is 'experience'");
    }
  }
  next();
});

// Compound indexes for optimized querying
blogSchema.index({ type: 1, status: 1, createdAt: -1 });
blogSchema.index({ "experience.company": 1, status: 1 });
blogSchema.index({ "experience.year": 1 });
blogSchema.index({ "experience.difficulty": 1 });

const Blog = model("blog", blogSchema);

module.exports = Blog;
