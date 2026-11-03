const { Router } = require("express");
const router = Router();
const Blog = require("../../models/blog");
const Comment = require("../../models/comment");
const User = require("../../models/user");
const { logAudit } = require("../../services/auditLogger");
const { uploadCover, upload: storeImage, remove: removeImage } = require("../../services/imageStorage");
const { body, validationResult } = require("express-validator");

function getIP(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

// GET /admin/blogs
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;
    const { search, status, sort } = req.query;

    const query = {};
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.title = re;
    }
    if (status && ["published", "hidden", "featured"].includes(status)) query.status = status;

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      title: { title: 1 },
    };
    const sortOpt = sortMap[sort] || { createdAt: -1 };

    const [blogs, total] = await Promise.all([
      Blog.find(query).sort(sortOpt).skip(skip).limit(limit).populate("createdBy", "fullName email"),
      Blog.countDocuments(query),
    ]);

    res.render("admin/blogs/list", {
      user: req.user,
      blogs,
      total,
      page,
      pages: Math.ceil(total / limit),
      query: req.query,
      flash: req.flash ? req.flash() : {},
    });
  } catch (err) {
    res.status(500).render("error", { user: req.user, message: "Failed to load blogs." });
  }
});

// GET /admin/blogs/:id/edit
router.get("/:id/edit", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id).populate("createdBy", "fullName email");
    if (!blog) return res.status(404).render("error", { user: req.user, message: "Blog not found." });
    const authors = await User.find().select("fullName email");
    res.render("admin/blogs/edit", {
      user: req.user,
      blog,
      authors,
      errors: [],
      flash: req.flash ? req.flash() : {},
    });
  } catch (err) {
    res.status(500).render("error", { user: req.user, message: "Failed to load blog." });
  }
});

// POST /admin/blogs/:id/edit
router.post(
  "/:id/edit",
  (req, res, next) => {
    uploadCover.single("coverImage")(req, res, (err) => {
      if (err) {
        return res.status(400).render("error", {
          user: req.user,
          message:
            err.code === "LIMIT_FILE_SIZE"
              ? "File too large. Maximum image size is 5MB."
              : err.message,
        });
      }
      next();
    });
  },
  [
    body("title").trim().notEmpty().withMessage("Title is required").escape(),
    body("body").trim().notEmpty().withMessage("Body is required"),
    body("status").isIn(["published", "hidden", "featured"]).withMessage("Invalid status"),
  ],
  async (req, res) => {
    const blog = await Blog.findById(req.params.id).populate("createdBy", "fullName email").catch(() => null);
    if (!blog) return res.status(404).render("error", { user: req.user, message: "Blog not found." });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const authors = await User.find().select("fullName email");
      return res.render("admin/blogs/edit", { user: req.user, blog, authors, errors: errors.array(), flash: {} });
    }

    let uploaded = null;
    try {
      const before = { title: blog.title, status: blog.status, createdBy: String(blog.createdBy?._id) };
      const updates = {
        title: req.body.title,
        body: req.body.body,
        status: req.body.status,
      };

      if (req.body.authorId) updates.createdBy = req.body.authorId;

      if (req.file) {
        uploaded = await storeImage(req.file.buffer, req.file.mimetype);
        // Delete old cover asset
        if (blog.coverImagePublicId) {
          await removeImage(blog.coverImagePublicId);
        } else if (blog.coverImageURL) {
          await removeImage(blog.coverImageURL);
        }
        updates.coverImageURL = uploaded.url;
        updates.coverImagePublicId = uploaded.publicId;
      }

      if (req.body.removeCover === "1") {
        if (blog.coverImagePublicId) {
          await removeImage(blog.coverImagePublicId);
        } else if (blog.coverImageURL) {
          await removeImage(blog.coverImageURL);
        }
        updates.coverImageURL = null;
        updates.coverImagePublicId = null;
      }

      await Blog.findByIdAndUpdate(req.params.id, updates);

      await logAudit({
        admin: req.user,
        action: "blog.edit",
        targetType: "blog",
        targetId: blog._id,
        targetLabel: blog.title,
        before,
        after: { title: updates.title, status: updates.status },
        ip: getIP(req),
      });

      if (req.flash) req.flash("success", "Blog updated.");
      res.redirect("/admin/blogs");
    } catch (err) {
      console.error(err);
      if (uploaded && uploaded.publicId) {
        await removeImage(uploaded.publicId);
      }
      const authors = await User.find().select("fullName email");
      res.render("admin/blogs/edit", { user: req.user, blog, authors, errors: [{ msg: "Error updating blog: " + err.message }], flash: {} });
    }
  }
);

// POST /admin/blogs/:id/delete
router.post("/:id/delete", async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.redirect("/admin/blogs");

    // Clean up asset from storage
    if (blog.coverImagePublicId) {
      await removeImage(blog.coverImagePublicId);
    } else if (blog.coverImageURL) {
      await removeImage(blog.coverImageURL);
    }

    await Blog.findByIdAndDelete(req.params.id);
    await Comment.deleteMany({ blogId: req.params.id });

    await logAudit({
      admin: req.user,
      action: "blog.delete",
      targetType: "blog",
      targetId: blog._id,
      targetLabel: blog.title,
      before: { title: blog.title, status: blog.status },
      ip: getIP(req),
    });

    if (req.flash) req.flash("success", "Blog deleted.");
    res.redirect("/admin/blogs");
  } catch (err) {
    res.redirect("/admin/blogs");
  }
});

// POST /admin/blogs/bulk — bulk actions: delete, hide, publish
router.post("/bulk", async (req, res) => {
  try {
    const { ids, action } = req.body;
    const idArr = Array.isArray(ids) ? ids : [ids].filter(Boolean);
    if (!idArr.length) return res.redirect("/admin/blogs");

    if (action === "delete") {
      const blogs = await Blog.find({ _id: { $in: idArr } });
      for (const blog of blogs) {
        if (blog.coverImagePublicId) {
          await removeImage(blog.coverImagePublicId);
        } else if (blog.coverImageURL) {
          await removeImage(blog.coverImageURL);
        }
      }
      await Blog.deleteMany({ _id: { $in: idArr } });
      await Comment.deleteMany({ blogId: { $in: idArr } });
      await logAudit({ admin: req.user, action: "blog.bulk_delete", targetType: "blog", targetLabel: `${idArr.length} blogs`, ip: getIP(req) });
    } else if (action === "hide") {
      await Blog.updateMany({ _id: { $in: idArr } }, { $set: { status: "hidden" } });
      await logAudit({ admin: req.user, action: "blog.bulk_hide", targetType: "blog", targetLabel: `${idArr.length} blogs`, ip: getIP(req) });
    } else if (action === "publish") {
      await Blog.updateMany({ _id: { $in: idArr } }, { $set: { status: "published" } });
      await logAudit({ admin: req.user, action: "blog.bulk_publish", targetType: "blog", targetLabel: `${idArr.length} blogs`, ip: getIP(req) });
    }

    if (req.flash) req.flash("success", `Bulk action "${action}" applied.`);
    res.redirect("/admin/blogs");
  } catch (err) {
    console.error(err);
    res.redirect("/admin/blogs");
  }
});

module.exports = router;
