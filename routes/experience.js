const { Router } = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const Blog = require("../models/blog");
const Company = require("../models/company");
const Comment = require("../models/comment");
const Report = require("../models/report");
const { deleteBlogsCascade } = require("../services/blogCleanup");
const { findOrCreateCompany, getDatalistCompanies, resolveCompanyChain } = require("../services/company");
const { getPublicAuthor } = require("../services/anonymity");
const { getSettings } = require("../services/settings");
const { formatModerationReason, invalidateOpenReportsCache } = require("../services/moderation");
const { doubleCsrfProtection } = require("../middlewares/csrf");
const {
  sanitizeString,
  findContactInfo,
  redactContactInfo,
  checkProhibitedContent,
  parseAndValidateExperiencePayload,
  VALID_REPORT_REASONS,
} = require("../services/experienceInput");

const router = Router();

// ─── Authentication Guard ───────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.redirect("/user/signin");
  }
  next();
}

// ─── Rate Limiters ──────────────────────────────────────────────────────────
// Applied ONLY to mutating POST routes (GET routes are never limited)
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many submission attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user && req.user._id) {
      return String(req.user._id);
    }
    return req.ip;
  },
});

const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Too many reports submitted. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user && req.user._id) {
      return String(req.user._id);
    }
    return req.ip;
  },
});

// ─── GET /experiences (Browse Page) ──────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 12;
    const skip = (page - 1) * limit;

    const query = {
      type: "experience",
      status: { $in: ["published", "featured"] },
    };

    const filters = {};

    // 1. Company Filter
    if (typeof req.query.company === "string" && req.query.company.trim()) {
      let compId = req.query.company.trim();
      if (mongoose.Types.ObjectId.isValid(compId)) {
        const comp = await Company.findById(compId);
        if (comp) {
          const resolved = await resolveCompanyChain(comp);
          compId = resolved._id.toString();
        }
        query["experience.company"] = new mongoose.Types.ObjectId(compId);
        filters.company = compId;
      }
    }

    // 2. Role Filter (case-insensitive substring search, max 50 chars, regex-escaped)
    if (typeof req.query.role === "string" && req.query.role.trim()) {
      const sanitizedRole = req.query.role.trim().slice(0, 50);
      const escapedRole = sanitizedRole.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query["experience.role"] = new RegExp(escapedRole, "i");
      filters.role = sanitizedRole;
    }

    // 3. Year Filter
    if (typeof req.query.year === "string" && req.query.year.trim()) {
      const parsedYear = parseInt(req.query.year.trim(), 10);
      if (!isNaN(parsedYear) && parsedYear >= 2015 && parsedYear <= new Date().getFullYear() + 1) {
        query["experience.year"] = parsedYear;
        filters.year = String(parsedYear);
      }
    }

    // 4. Drive Type Filter
    const VALID_DRIVES = ["on-campus", "off-campus", "internship"];
    if (typeof req.query.driveType === "string" && VALID_DRIVES.includes(req.query.driveType.trim())) {
      query["experience.driveType"] = req.query.driveType.trim();
      filters.driveType = req.query.driveType.trim();
    }

    // 5. Difficulty Filter
    if (typeof req.query.difficulty === "string" && req.query.difficulty.trim()) {
      const parsedDiff = parseInt(req.query.difficulty.trim(), 10);
      if (!isNaN(parsedDiff) && parsedDiff >= 1 && parsedDiff <= 5) {
        query["experience.difficulty"] = parsedDiff;
        filters.difficulty = String(parsedDiff);
      }
    }

    // 6. Outcome Filter
    const VALID_OUTCOMES = ["selected", "rejected", "waiting", "undisclosed"];
    if (typeof req.query.outcome === "string" && VALID_OUTCOMES.includes(req.query.outcome.trim())) {
      query["experience.outcome"] = req.query.outcome.trim();
      filters.outcome = req.query.outcome.trim();
    }

    // Total count for pagination
    const totalCount = await Blog.countDocuments(query);
    const totalPages = Math.ceil(totalCount / limit) || 1;

    // Fetch experiences lean, newest first
    const rawExperiences = await Blog.find(query)
      .populate("experience.company", "name slug")
      .populate("createdBy", "fullName profileImageURL email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Map to sanitized view-model with ONLY required fields (getPublicAuthor enforces anonymity)
    const experiences = rawExperiences.map((exp) => ({
      id: exp._id.toString(),
      title: exp.title || "",
      company: exp.experience?.company?.name || "Company",
      companySlug: exp.experience?.company?.slug || "",
      role: exp.experience?.role || "",
      year: exp.experience?.year || "",
      driveType: exp.experience?.driveType || "",
      outcome: exp.experience?.outcome || "undisclosed",
      difficulty: exp.experience?.difficulty || 3,
      verified: Boolean(exp.experience?.verified),
      isDemo: Boolean(exp.isDemo),
      createdAt: exp.createdAt,
      author: getPublicAuthor(exp),
    }));

    const filterCompanies = await getDatalistCompanies();

    res.render("experiences/index", {
      user: req.user,
      experiences,
      companies: filterCompanies,
      filters,
      totalCount,
      currentPage: page,
      totalPages,
    });
  } catch (err) {
    console.error("Error loading experiences browse page:", err);
    res.status(500).render("error", {
      user: req.user,
      message: "Error loading interview experiences",
    });
  }
});

// ─── GET /experiences/new ─────────────────────────────────────────────────────
router.get("/new", requireAuth, async (req, res) => {
  try {
    const companies = await getDatalistCompanies();
    const settings = await getSettings();
    const aiStructureEnabled = settings.aiEnabled && settings.aiStructureEnabled !== false;

    res.render("experiences/new", {
      user: req.user,
      companies,
      formData: {},
      errors: {},
      aiStructureEnabled,
      csrfToken: res.locals.csrfToken,
    });
  } catch (error) {
    console.error("Error loading new experience form:", error);
    res.status(500).render("error", {
      user: req.user,
      message: "Error loading experience form",
    });
  }
});

// ─── POST /experiences ────────────────────────────────────────────────────────
router.post(
  "/",
  requireAuth,
  submitLimiter,
  doubleCsrfProtection,
  async (req, res) => {
    try {
      const settings = await getSettings();
      const aiStructureEnabled = settings.aiEnabled && settings.aiStructureEnabled !== false;

      // 1. Abuse check: Max 5 experiences per user per 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const userTodayCount = await Blog.countDocuments({
        createdBy: req.user._id,
        type: "experience",
        createdAt: { $gte: oneDayAgo },
      });

      if (userTodayCount >= 5) {
        const companies = await getDatalistCompanies();
        return res.status(429).render("experiences/new", {
          user: req.user,
          companies,
          formData: req.body,
          errors: { general: "You have reached the limit of 5 interview experiences per 24 hours." },
          aiStructureEnabled,
          csrfToken: res.locals.csrfToken,
        });
      }

      // 2. Parse and Validate Payload via Shared Service
      const { isValid, errors, parsedData } = parseAndValidateExperiencePayload(req.body);

      let companyDoc = null;
      if (parsedData?.companyName) {
        try {
          companyDoc = await findOrCreateCompany(parsedData.companyName);
        } catch (compErr) {
          errors.company = compErr.message;
        }
      }

      if (!isValid || Object.keys(errors).length > 0 || !companyDoc) {
        const companies = await getDatalistCompanies();
        return res.status(400).render("experiences/new", {
          user: req.user,
          companies,
          formData: req.body,
          errors,
          aiStructureEnabled,
          csrfToken: res.locals.csrfToken,
        });
      }

      // 3. Create Experience Document
      const title = `${companyDoc.name} - ${parsedData.role} (${parsedData.year})`;
      const rawStory = parsedData.story || "";
      const bodyText = rawStory || `Interview experience for ${parsedData.role} at ${companyDoc.name} (${parsedData.year}).`;

      const experienceDoc = {
        title,
        body: bodyText,
        type: "experience",
        status: "published",
        createdBy: req.user._id,
        experience: {
          company: companyDoc._id,
          role: parsedData.role,
          driveType: parsedData.driveType,
          year: parsedData.year,
          difficulty: parsedData.difficulty,
          outcome: parsedData.outcome,
          tips: parsedData.tips,
          anonymous: parsedData.anonymous,
          verified: false,
          rounds: parsedData.rounds,
        },
      };

      const blog = await Blog.create(experienceDoc);

      // Straggler check: re-read company in case a concurrent merge completed
      let freshCompany = await Company.findById(companyDoc._id);
      let chainDepth = 0;
      while (freshCompany && freshCompany.mergedInto && chainDepth < 5) {
        chainDepth++;
        const targetCo = await Company.findById(freshCompany.mergedInto);
        if (targetCo) {
          await Blog.updateOne({ _id: blog._id }, { $set: { "experience.company": targetCo._id } });
          freshCompany = targetCo;
        } else {
          break;
        }
      }

      return res.redirect(`/experiences/${blog._id}`);
    } catch (err) {
      console.error("Error creating interview experience:", err);
      const companies = await getDatalistCompanies();
      const settings = await getSettings().catch(() => ({ aiEnabled: false, aiStructureEnabled: false }));
      const aiStructureEnabled = settings.aiEnabled && settings.aiStructureEnabled !== false;
      return res.status(500).render("experiences/new", {
        user: req.user,
        companies,
        formData: req.body,
        errors: { general: "An unexpected error occurred while saving. Please try again." },
        aiStructureEnabled,
        csrfToken: res.locals.csrfToken,
      });
    }
  }
);

// ─── GET /experiences/mine ────────────────────────────────────────────────────
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const rawExperiences = await Blog.find({
      createdBy: req.user._id,
      type: "experience",
    })
      .populate("experience.company", "name slug")
      .populate("createdBy", "fullName profileImageURL email")
      .sort({ createdAt: -1 })
      .lean();

    const experiences = rawExperiences.map((exp) => ({
      id: exp._id.toString(),
      title: exp.title,
      company: exp.experience?.company?.name || "Company",
      companySlug: exp.experience?.company?.slug || "",
      role: exp.experience?.role || "",
      year: exp.experience?.year || "",
      driveType: exp.experience?.driveType || "",
      outcome: exp.experience?.outcome || "undisclosed",
      difficulty: exp.experience?.difficulty || 3,
      status: exp.status,
      moderationReason: exp.status === "hidden" ? formatModerationReason(exp.moderationReason) : null,
      moderationNote: exp.status === "hidden" ? exp.moderationNote : null,
      verified: Boolean(exp.experience?.verified),
      anonymous: Boolean(exp.experience?.anonymous),
      createdAt: exp.createdAt,
      author: getPublicAuthor(exp),
    }));

    res.render("experiences/mine", {
      user: req.user,
      experiences,
      csrfToken: res.locals.csrfToken,
    });
  } catch (err) {
    console.error("Error loading user experiences:", err);
    res.status(500).render("error", {
      user: req.user,
      message: "Error loading your experiences",
    });
  }
});

// ─── GET /experiences/:id ─────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).render("error", { user: req.user, message: "Experience not found" });
    }

    const blog = await Blog.findById(id)
      .populate("experience.company")
      .populate("createdBy", "fullName profileImageURL email");

    if (!blog || blog.type !== "experience") {
      return res.status(404).render("error", { user: req.user, message: "Experience not found" });
    }

    const postAuthorId = blog.createdBy?._id ? String(blog.createdBy._id) : String(blog.createdBy || "");
    const isOwner = Boolean(req.user && postAuthorId && String(req.user._id) === postAuthorId);
    const isAdmin = Boolean(req.user && req.user.role === "ADMIN");

    if (blog.status === "hidden" && !isOwner && !isAdmin) {
      return res.status(404).render("error", { user: req.user, message: "Experience not found" });
    }

    // Load comments
    const rawComments = await Comment.find({ blogId: blog._id })
      .populate("createdBy", "fullName profileImageURL _id")
      .sort({ createdAt: 1 });

    const isAnonymous = Boolean(blog.experience?.anonymous);
    const publicAuthor = getPublicAuthor(blog);

    // Format comments: badge original poster if author comments on their own anonymous post
    const comments = rawComments.map((c) => {
      const commentAuthorId = c.createdBy?._id ? String(c.createdBy._id) : String(c.createdBy || "");
      const isCommentByPostAuthor = Boolean(postAuthorId && commentAuthorId && postAuthorId === commentAuthorId);

      if (isAnonymous && isCommentByPostAuthor) {
        return {
          _id: c._id,
          content: c.content,
          createdAt: c.createdAt,
          authorName: "Original Poster (Author)",
          authorAvatar: "/Images/default.svg",
          isAuthorBadge: true,
        };
      }

      return {
        _id: c._id,
        content: c.content,
        createdAt: c.createdAt,
        authorName: c.createdBy?.fullName || "Deleted user",
        authorAvatar: c.createdBy?.profileImageURL || "/Images/default.svg",
        isAuthorBadge: false,
      };
    });

    // Sanitized experience view-model (never pass raw createdBy)
    const experienceData = {
      _id: blog._id,  
      title: blog.title,
      body: blog.body,
      createdAt: blog.createdAt,
      status: blog.status,
      isDemo: Boolean(blog.isDemo),
      moderationReason: (isOwner || isAdmin) && blog.status === "hidden" ? formatModerationReason(blog.moderationReason) : null,
      moderationNote: (isOwner || isAdmin) && blog.status === "hidden" ? blog.moderationNote : null,
      experience: {
        company: blog.experience?.company
          ? {
              name: blog.experience.company.name,
              slug: blog.experience.company.slug,
              _id: blog.experience.company._id,
            }
          : null,
        role: blog.experience?.role,
        year: blog.experience?.year,
        driveType: blog.experience?.driveType,
        difficulty: blog.experience?.difficulty,
        outcome: blog.experience?.outcome,
        tips: blog.experience?.tips,
        verified: blog.experience?.verified,
        rounds: blog.experience?.rounds || [],
      },
    };

    res.render("experiences/detail", {
      user: req.user,
      experience: experienceData,
      publicAuthor,
      isOwner,
      isAdmin,
      isAnonymous,
      isHidden: blog.status === "hidden",
      comments,
      csrfToken: res.locals.csrfToken,
    });
  } catch (err) {
    console.error("Error loading experience detail:", err);
    res.status(500).render("error", { user: req.user, message: "Error loading experience" });
  }
});

// ─── GET /experiences/:id/edit ────────────────────────────────────────────────
router.get("/:id/edit", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).render("error", { user: req.user, message: "Experience not found" });
    }

    const blog = await Blog.findById(id).populate("experience.company");
    if (!blog || blog.type !== "experience") {
      return res.status(404).render("error", { user: req.user, message: "Experience not found" });
    }

    const isOwner = String(req.user._id) === String(blog.createdBy);
    const isAdmin = req.user.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return res.status(403).render("error", { user: req.user, message: "You are not authorized to edit this experience." });
    }

    const companies = await getDatalistCompanies();
    const formData = {
      company: blog.experience?.company?.name || "",
      role: blog.experience?.role || "",
      driveType: blog.experience?.driveType || "",
      year: blog.experience?.year || "",
      difficulty: blog.experience?.difficulty || "",
      outcome: blog.experience?.outcome || "undisclosed",
      tips: blog.experience?.tips || "",
      story: blog.body || "",
      anonymous: blog.experience?.anonymous ? "on" : "",
      noContactDetails: "on",
      rounds: (blog.experience?.rounds || []).map((r) => ({
        name: r.name,
        type: r.type,
        duration: r.duration || "",
        durationMinutes: r.durationMinutes || "",
        description: r.description || "",
        difficulty: r.difficulty,
        questions: r.questions || [],
      })),
    };

    res.render("experiences/edit", {
      user: req.user,
      experienceId: blog._id,
      companies,
      formData,
      wasVerified: Boolean(blog.experience?.verified),
      errors: {},
      csrfToken: res.locals.csrfToken,
    });
  } catch (err) {
    console.error("Error loading experience edit page:", err);
    res.status(500).render("error", { user: req.user, message: "Error loading experience" });
  }
});

// ─── POST /experiences/:id/edit ──────────────────────────────────────────────
router.post(
  "/:id/edit",
  requireAuth,
  submitLimiter,
  doubleCsrfProtection,
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).render("error", { user: req.user, message: "Experience not found" });
      }

      const blog = await Blog.findById(id);
      if (!blog || blog.type !== "experience") {
        return res.status(404).render("error", { user: req.user, message: "Experience not found" });
      }

      const isOwner = String(req.user._id) === String(blog.createdBy);
      const isAdmin = req.user.role === "ADMIN";
      if (!isOwner && !isAdmin) {
        return res.status(403).render("error", { user: req.user, message: "You are not authorized to edit this experience." });
      }

      const { isValid, errors, parsedData } = parseAndValidateExperiencePayload(req.body);

      let companyDoc = null;
      if (parsedData?.companyName) {
        try {
          companyDoc = await findOrCreateCompany(parsedData.companyName);
        } catch (compErr) {
          errors.company = compErr.message;
        }
      }

      if (!isValid || Object.keys(errors).length > 0 || !companyDoc) {
        const companies = await getDatalistCompanies();
        return res.status(400).render("experiences/edit", {
          user: req.user,
          experienceId: blog._id,
          companies,
          formData: req.body,
          wasVerified: Boolean(blog.experience?.verified),
          errors,
          csrfToken: res.locals.csrfToken,
        });
      }

      const rawStory = parsedData.story || "";
      const title = `${companyDoc.name} - ${parsedData.role} (${parsedData.year})`;

      blog.title = title;
      if (rawStory) {
        blog.body = rawStory;
      }
      blog.experience.company = companyDoc._id;
      blog.experience.role = parsedData.role;
      blog.experience.driveType = parsedData.driveType;
      blog.experience.year = parsedData.year;
      blog.experience.difficulty = parsedData.difficulty;
      blog.experience.outcome = parsedData.outcome;
      blog.experience.tips = parsedData.tips;
      blog.experience.anonymous = parsedData.anonymous;
      blog.experience.verified = false; // Reset verified badge upon edit
      blog.experience.rounds = parsedData.rounds;

      await blog.save();

      // Straggler check: re-read company in case a concurrent merge completed
      let freshCompany = await Company.findById(companyDoc._id);
      let chainDepth = 0;
      while (freshCompany && freshCompany.mergedInto && chainDepth < 5) {
        chainDepth++;
        const targetCo = await Company.findById(freshCompany.mergedInto);
        if (targetCo) {
          await Blog.updateOne({ _id: blog._id }, { $set: { "experience.company": targetCo._id } });
          freshCompany = targetCo;
        } else {
          break;
        }
      }

      if (req.flash) {
        req.flash("success", "Interview experience updated successfully.");
      }
      return res.redirect(`/experiences/${blog._id}`);
    } catch (err) {
      console.error("Error editing experience:", err);
      const companies = await getDatalistCompanies();
      return res.status(500).render("experiences/edit", {
        user: req.user,
        experienceId: req.params.id,
        companies,
        formData: req.body,
        errors: { general: "An error occurred while updating the experience." },
        csrfToken: res.locals.csrfToken,
      });
    }
  }
);

// ─── POST /experiences/:id/delete ────────────────────────────────────────────
router.post("/:id/delete", requireAuth, doubleCsrfProtection, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).render("error", { user: req.user, message: "Experience not found" });
    }

    const blog = await Blog.findById(id);
    if (!blog || blog.type !== "experience") {
      return res.status(404).render("error", { user: req.user, message: "Experience not found" });
    }

    const isOwner = String(req.user._id) === String(blog.createdBy);
    const isAdmin = req.user.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return res.status(403).render("error", { user: req.user, message: "You are not authorized to delete this experience." });
    }

    // Cascade delete comments, reports, images, and blog
    await deleteBlogsCascade(blog._id);

    if (req.flash) {
      req.flash("success", "Interview experience deleted successfully.");
    }
    return res.redirect("/experiences/mine");
  } catch (err) {
    console.error("Error deleting experience:", err);
    return res.redirect("/experiences/mine");
  }
});

// ─── POST /experiences/:id/report ────────────────────────────────────────────
router.post("/:id/report", requireAuth, reportLimiter, doubleCsrfProtection, async (req, res) => {
  try {
    const isJson = req.xhr || req.headers.accept?.includes("application/json");
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      if (isJson) return res.status(404).json({ error: "Experience not found" });
      return res.status(404).render("error", { user: req.user, message: "Experience not found" });
    }

    const blog = await Blog.findById(id);
    if (!blog || blog.type !== "experience") {
      if (isJson) return res.status(404).json({ error: "Experience not found" });
      return res.status(404).render("error", { user: req.user, message: "Experience not found" });
    }

    if (blog.status === "hidden") {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(400).json({ error: "Cannot report a hidden post" });
      }
      if (req.flash) req.flash("error", "Cannot report a hidden post");
      return res.redirect(`/experiences/${blog._id}`);
    }

    // Self-reporting guard
    if (String(req.user._id) === String(blog.createdBy)) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(400).json({ error: "You cannot report your own post" });
      }
      if (req.flash) req.flash("error", "You cannot report your own post");
      return res.redirect(`/experiences/${blog._id}`);
    }

    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    if (!VALID_REPORT_REASONS.includes(reason)) {
      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.status(400).json({ error: "Please select a valid report reason." });
      }
      if (req.flash) req.flash("error", "Please select a valid report reason.");
      return res.redirect(`/experiences/${blog._id}`);
    }

    const note = typeof req.body.note === "string" ? sanitizeString(req.body.note).slice(0, 300) : "";

    try {
      await Report.create({
        blog: blog._id,
        reporter: req.user._id,
        reason,
        note,
      });

      invalidateOpenReportsCache();

      if (req.xhr || req.headers.accept?.includes("application/json")) {
        return res.json({ success: true, message: "Thank you for reporting. Our team will review this post." });
      }
      if (req.flash) req.flash("success", "Thank you for reporting. Our team will review this post.");
      return res.redirect(`/experiences/${blog._id}`);
    } catch (createErr) {
      // Gracefully handle duplicate reports (E11000)
      if (createErr.code === 11000) {
        if (req.xhr || req.headers.accept?.includes("application/json")) {
          return res.status(400).json({ error: "You already reported this" });
        }
        if (req.flash) req.flash("error", "You already reported this");
        return res.redirect(`/experiences/${blog._id}`);
      }
      throw createErr;
    }
  } catch (err) {
    console.error("Error submitting report:", err);
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(500).json({ error: "Error submitting report" });
    }
    return res.status(500).render("error", { user: req.user, message: "Error submitting report" });
  }
});

module.exports = router;
