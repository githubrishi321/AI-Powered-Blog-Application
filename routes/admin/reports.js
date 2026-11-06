const { Router } = require("express");
const mongoose = require("mongoose");
const router = Router();
const Blog = require("../../models/blog");
const Report = require("../../models/report");
const { logAudit } = require("../../services/auditLogger");
const { deleteBlogsCascade } = require("../../services/blogCleanup");
const {
  hideExperience,
  publishExperience,
  featureExperience,
  unfeatureExperience,
  setVerified,
  dismissReports,
  MODERATION_REASONS,
} = require("../../services/moderation");

const VALID_REASONS = ["spam", "promotional", "personal-info", "abusive", "fake", "other"];

function getIP(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

// ─── GET /admin/reports (Queue) ──────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;

    const rawStatus = typeof req.query.status === "string" ? req.query.status : "open";
    const statusFilter = ["open", "resolved", "dismissed", "all"].includes(rawStatus) ? rawStatus : "open";

    const rawReason = typeof req.query.reason === "string" ? req.query.reason : "";
    const reasonFilter = VALID_REASONS.includes(rawReason) ? rawReason : "";

    const matchStage = {};
    if (statusFilter !== "all") {
      matchStage.status = statusFilter;
    }
    if (reasonFilter) {
      matchStage.reason = reasonFilter;
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: "$blog",
          openReports: {
            $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] },
          },
          totalReports: { $sum: 1 },
          reasons: { $addToSet: "$reason" },
          newestReportDate: { $max: "$createdAt" },
        },
      },
      {
        $lookup: {
          from: "blogs",
          localField: "_id",
          foreignField: "_id",
          as: "blogDoc",
        },
      },
      { $unwind: "$blogDoc" },
      { $match: { "blogDoc.type": "experience" } },
      {
        $lookup: {
          from: "companies",
          localField: "blogDoc.experience.company",
          foreignField: "_id",
          as: "companyDoc",
        },
      },
      {
        $unwind: {
          path: "$companyDoc",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          blogId: "$_id",
          postTitle: "$blogDoc.title",
          companyName: { $ifNull: ["$companyDoc.name", "Unknown Company"] },
          postStatus: "$blogDoc.status",
          verified: { $ifNull: ["$blogDoc.experience.verified", false] },
          openReports: 1,
          totalReports: 1,
          reasons: 1,
          newestReportDate: 1,
        },
      },
      { $sort: { newestReportDate: -1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: limit }],
        },
      },
    ];

    const aggregationResult = await Report.aggregate(pipeline);
    const totalGroups = aggregationResult[0]?.metadata[0]?.total || 0;
    const reportsList = aggregationResult[0]?.data || [];

    res.render("admin/reports/index", {
      user: req.user,
      currentPage: "reports",
      reports: reportsList,
      total: totalGroups,
      page,
      pages: Math.max(1, Math.ceil(totalGroups / limit)),
      query: { status: statusFilter, reason: reasonFilter },
      flash: req.flash ? req.flash() : {},
      csrfToken: res.locals.csrfToken,
    });
  } catch (err) {
    console.error("Admin report queue error:", err);
    res.status(500).render("error", { user: req.user, message: "Failed to load report queue." });
  }
});

// Helper: validate ObjectId & experience type -> 404 on failure
async function getExperienceOr404(req, res, id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).render("error", { user: req.user, message: "Invalid experience ID or experience not found." });
    return null;
  }
  const blog = await Blog.findById(id)
    .populate("experience.company")
    .populate("createdBy", "fullName email role");

  if (!blog || blog.type !== "experience") {
    res.status(404).render("error", { user: req.user, message: "Experience not found or not an interview experience." });
    return null;
  }
  return blog;
}

// ─── GET /admin/reports/:blogId (Detail) ──────────────────────────────────────
router.get("/:blogId", async (req, res) => {
  try {
    const blog = await getExperienceOr404(req, res, req.params.blogId);
    if (!blog) return;

    const reports = await Report.find({ blog: blog._id })
      .populate("reporter", "fullName email")
      .populate("resolvedBy", "fullName email")
      .sort({ createdAt: -1 });

    const openCount = reports.filter((r) => r.status === "open").length;

    res.render("admin/reports/detail", {
      user: req.user,
      currentPage: "reports",
      blog: {
        _id: blog._id,
        title: blog.title,
        body: blog.body,
        status: blog.status,
        moderationReason: blog.moderationReason,
        moderationNote: blog.moderationNote,
        createdAt: blog.createdAt,
        companyName: blog.experience?.company?.name || "Unknown Company",
        companySlug: blog.experience?.company?.slug || "",
        role: blog.experience?.role,
        year: blog.experience?.year,
        driveType: blog.experience?.driveType,
        difficulty: blog.experience?.difficulty,
        outcome: blog.experience?.outcome,
        tips: blog.experience?.tips,
        rounds: blog.experience?.rounds || [],
        verified: Boolean(blog.experience?.verified),
        anonymous: Boolean(blog.experience?.anonymous),
        authorRealName: blog.createdBy?.fullName || "Deleted User",
        authorRealEmail: blog.createdBy?.email || "N/A",
      },
      reports: reports.map((r) => ({
        _id: r._id,
        reason: r.reason,
        note: r.note,
        status: r.status,
        createdAt: r.createdAt,
        reporterName: r.reporter?.fullName || "Deleted User",
        reporterEmail: r.reporter?.email || "N/A",
        resolvedByName: r.resolvedBy?.fullName || null,
        resolvedAt: r.resolvedAt,
      })),
      openReportsCount: openCount,
      flash: req.flash ? req.flash() : {},
      csrfToken: res.locals.csrfToken,
    });
  } catch (err) {
    console.error("Admin report detail error:", err);
    res.status(500).render("error", { user: req.user, message: "Failed to load report detail." });
  }
});

// ─── POST /admin/reports/:blogId/dismiss ──────────────────────────────────────
router.post("/:blogId/dismiss", async (req, res) => {
  try {
    const blog = await getExperienceOr404(req, res, req.params.blogId);
    if (!blog) return;

    const result = await dismissReports(blog._id, req.user);
    if (req.flash) req.flash(result.changed ? "success" : "info", result.message);
    res.redirect(`/admin/reports/${blog._id}`);
  } catch (err) {
    console.error("Dismiss reports error:", err);
    res.redirect(`/admin/reports/${req.params.blogId}`);
  }
});

// ─── POST /admin/reports/:blogId/hide ─────────────────────────────────────────
router.post("/:blogId/hide", async (req, res) => {
  try {
    const blog = await getExperienceOr404(req, res, req.params.blogId);
    if (!blog) return;

    const { reason, note } = req.body;
    if (!reason || !VALID_REASONS.includes(reason)) {
      if (req.flash) req.flash("error", "A valid moderation reason is required.");
      return res.redirect(`/admin/reports/${blog._id}`);
    }

    if (typeof note === "string" && note.length > 200) {
      if (req.flash) req.flash("error", "Moderation note must be 200 characters or fewer.");
      return res.redirect(`/admin/reports/${blog._id}`);
    }

    const result = await hideExperience(blog._id, req.user, reason, note);
    if (req.flash) req.flash(result.changed ? "success" : "info", result.message);
    res.redirect(`/admin/reports/${blog._id}`);
  } catch (err) {
    console.error("Hide experience error:", err);
    res.redirect(`/admin/reports/${req.params.blogId}`);
  }
});

// ─── POST /admin/reports/:blogId/publish ──────────────────────────────────────
router.post("/:blogId/publish", async (req, res) => {
  try {
    const blog = await getExperienceOr404(req, res, req.params.blogId);
    if (!blog) return;

    const result = await publishExperience(blog._id, req.user);
    if (req.flash) req.flash(result.changed ? "success" : "info", result.message);
    res.redirect(`/admin/reports/${blog._id}`);
  } catch (err) {
    console.error("Publish experience error:", err);
    res.redirect(`/admin/reports/${req.params.blogId}`);
  }
});

// ─── POST /admin/reports/:blogId/feature ──────────────────────────────────────
router.post("/:blogId/feature", async (req, res) => {
  try {
    const blog = await getExperienceOr404(req, res, req.params.blogId);
    if (!blog) return;

    const result = await featureExperience(blog._id, req.user);
    if (req.flash) req.flash(result.changed ? "success" : "info", result.message);
    res.redirect(`/admin/reports/${blog._id}`);
  } catch (err) {
    console.error("Feature experience error:", err);
    res.redirect(`/admin/reports/${req.params.blogId}`);
  }
});

// ─── POST /admin/reports/:blogId/unfeature ────────────────────────────────────
router.post("/:blogId/unfeature", async (req, res) => {
  try {
    const blog = await getExperienceOr404(req, res, req.params.blogId);
    if (!blog) return;

    const result = await unfeatureExperience(blog._id, req.user);
    if (req.flash) req.flash(result.changed ? "success" : "info", result.message);
    res.redirect(`/admin/reports/${blog._id}`);
  } catch (err) {
    console.error("Unfeature experience error:", err);
    res.redirect(`/admin/reports/${req.params.blogId}`);
  }
});

// ─── POST /admin/reports/:blogId/verify ───────────────────────────────────────
router.post("/:blogId/verify", async (req, res) => {
  try {
    const blog = await getExperienceOr404(req, res, req.params.blogId);
    if (!blog) return;

    const result = await setVerified(blog._id, true, req.user);
    if (req.flash) req.flash(result.changed ? "success" : "info", result.message);
    res.redirect(`/admin/reports/${blog._id}`);
  } catch (err) {
    console.error("Verify experience error:", err);
    res.redirect(`/admin/reports/${req.params.blogId}`);
  }
});

// ─── POST /admin/reports/:blogId/unverify ─────────────────────────────────────
router.post("/:blogId/unverify", async (req, res) => {
  try {
    const blog = await getExperienceOr404(req, res, req.params.blogId);
    if (!blog) return;

    const result = await setVerified(blog._id, false, req.user);
    if (req.flash) req.flash(result.changed ? "success" : "info", result.message);
    res.redirect(`/admin/reports/${blog._id}`);
  } catch (err) {
    console.error("Unverify experience error:", err);
    res.redirect(`/admin/reports/${req.params.blogId}`);
  }
});

// ─── POST /admin/reports/:blogId/delete ───────────────────────────────────────
router.post("/:blogId/delete", async (req, res) => {
  try {
    const blog = await getExperienceOr404(req, res, req.params.blogId);
    if (!blog) return;

    const { confirmation } = req.body;
    if (confirmation !== "DELETE") {
      if (req.flash) req.flash("error", 'Type the word "DELETE" to confirm deletion.');
      return res.redirect(`/admin/reports/${blog._id}`);
    }

    const beforeTitle = blog.title;
    const beforeStatus = blog.status;
    const result = await deleteBlogsCascade(blog._id);

    await logAudit({
      admin: req.user,
      action: "experience.delete",
      targetType: "blog",
      targetId: blog._id,
      targetLabel: beforeTitle,
      before: { status: beforeStatus, reportsAffected: result.deletedReports },
      after: { deleted: true },
      ip: getIP(req),
    });

    if (req.flash) req.flash("success", `Experience and ${result.deletedReports} associated report(s) deleted.`);
    res.redirect("/admin/reports");
  } catch (err) {
    console.error("Delete experience error:", err);
    res.redirect("/admin/reports");
  }
});

module.exports = router;
