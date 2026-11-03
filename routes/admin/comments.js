const { Router } = require("express");
const router = Router();
const Comment = require("../../models/comment");
const { logAudit } = require("../../services/auditLogger");
const { body, validationResult } = require("express-validator");

function getIP(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

// GET /admin/comments
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 30;
    const skip = (page - 1) * limit;
    const { search, blogId, userId } = req.query;

    const query = {};
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.content = re;
    }
    if (blogId) query.blogId = blogId;
    if (userId) query.createdBy = userId;

    const [comments, total] = await Promise.all([
      Comment.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "fullName email")
        .populate("blogId", "title"),
      Comment.countDocuments(query),
    ]);

    res.render("admin/comments/list", {
      user: req.user,
      comments,
      total,
      page,
      pages: Math.ceil(total / limit),
      query: req.query,
      flash: req.flash ? req.flash() : {},
    });
  } catch (err) {
    res.status(500).render("error", { user: req.user, message: "Failed to load comments." });
  }
});

// POST /admin/comments/:id/delete
router.post("/:id/delete", async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id).populate("blogId", "title");
    if (!comment) return res.redirect("/admin/comments");

    await Comment.findByIdAndDelete(req.params.id);
    await logAudit({
      admin: req.user,
      action: "comment.delete",
      targetType: "comment",
      targetId: comment._id,
      targetLabel: comment.content?.substring(0, 60),
      ip: getIP(req),
    });

    if (req.flash) req.flash("success", "Comment deleted.");
    res.redirect("/admin/comments");
  } catch (err) {
    res.redirect("/admin/comments");
  }
});

// POST /admin/comments/bulk
router.post("/bulk", async (req, res) => {
  try {
    const { ids } = req.body;
    const idArr = Array.isArray(ids) ? ids : [ids].filter(Boolean);
    if (!idArr.length) return res.redirect("/admin/comments");

    await Comment.deleteMany({ _id: { $in: idArr } });
    await logAudit({
      admin: req.user,
      action: "comment.bulk_delete",
      targetType: "comment",
      targetLabel: `${idArr.length} comments`,
      ip: getIP(req),
    });

    if (req.flash) req.flash("success", `${idArr.length} comments deleted.`);
    res.redirect("/admin/comments");
  } catch (err) {
    res.redirect("/admin/comments");
  }
});

module.exports = router;

