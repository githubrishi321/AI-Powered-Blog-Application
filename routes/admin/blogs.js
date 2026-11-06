const { Router } = require("express");
const router = Router();
const mongoose = require("mongoose");
const Blog = require("../../models/blog");
const Comment = require("../../models/comment");
const Report = require("../../models/report");
const User = require("../../models/user");
const { logAudit } = require("../../services/auditLogger");
const { deleteBlogsCascade } = require("../../services/blogCleanup");
const { uploadCover, upload: storeImage, remove: removeImage } = require("../../services/imageStorage");
const { body, validationResult } = require("express-validator");
const {
  hideExperience,
  publishExperience,
  featureExperience,
  setVerified,
  setExperienceStatus,
} = require("../../services/moderation");

function getIP(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

// GET /admin/blogs
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;

    const rawSearch = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const rawStatus = typeof req.query.status === "string" ? req.query.status : "";
    const rawType = typeof req.query.type === "string" ? req.query.type : "";
    const rawVerified = typeof req.query.verified === "string" ? req.query.verified : "";
    const rawSort = typeof req.query.sort === "string" ? req.query.sort : "";

    const query = {};
    if (rawSearch) {
      const re = new RegExp(rawSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.title = re;
    }
    if (["published", "hidden", "featured"].includes(rawStatus)) query.status = rawStatus;
    if (["blog", "experience"].includes(rawType)) query.type = rawType;
    if (rawVerified === "verified") query["experience.verified"] = true;
    if (rawVerified === "unverified") query["experience.verified"] = false;

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      title: { title: 1 },
    };
    const sortOpt = sortMap[rawSort] || { createdAt: -1 };

    const [blogs, total] = await Promise.all([
      Blog.find(query)
        .sort(sortOpt)
        .skip(skip)
        .limit(limit)
        .populate("createdBy", "fullName email")
        .populate("experience.company", "name slug"),
      Blog.countDocuments(query),
    ]);

    res.render("admin/blogs/list", {
      user: req.user,
      blogs,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      query: { search: rawSearch, status: rawStatus, type: rawType, verified: rawVerified, sort: rawSort },
      flash: res.locals.flash || (req.flash ? req.flash() : {}),
    });
  } catch (err) {
    res.status(500).render("error", { user: req.user, message: "Failed to load blogs." });
  }
});

// GET /admin/blogs/:id/edit
router.get("/:id/edit", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).render("error", { user: req.user, message: "Blog not found." });
    }
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
    body("body").custom(async (val, { req }) => {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) return true;
      const blog = await Blog.findById(req.params.id);
      if (blog && blog.type === "experience") return true;
      if (!val || !val.trim()) throw new Error("Body is required");
      return true;
    }),
    body("status").isIn(["published", "hidden", "featured"]).withMessage("Invalid status"),
    body("authorId")
      .optional({ checkFalsy: true })
      .custom(async (val) => {
        if (!mongoose.Types.ObjectId.isValid(val)) {
          throw new Error("Invalid author ID");
        }
        const userExists = await User.exists({ _id: val });
        if (!userExists) {
          throw new Error("Author does not exist");
        }
        return true;
      }),
  ],
  async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).render("error", { user: req.user, message: "Blog not found." });
    }
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
      const originalStatus = blog.status;
      const targetStatus = req.body.status;

      blog.title = req.body.title;
      // If experience, allow empty body; otherwise assign body
      if (blog.type === "experience") {
        blog.body = req.body.body ? req.body.body.trim() : undefined;
      } else {
        blog.body = req.body.body;
      }

      if (req.body.authorId) blog.createdBy = req.body.authorId;

      if (req.file) {
        uploaded = await storeImage(req.file.buffer, req.file.mimetype);
        // Delete old cover asset
        if (blog.coverImagePublicId) {
          await removeImage(blog.coverImagePublicId);
        } else if (blog.coverImageURL) {
          await removeImage(blog.coverImageURL);
        }
        blog.coverImageURL = uploaded.url;
        blog.coverImagePublicId = uploaded.publicId;
      }

      if (req.body.removeCover === "1") {
        if (blog.coverImagePublicId) {
          await removeImage(blog.coverImagePublicId);
        } else if (blog.coverImageURL) {
          await removeImage(blog.coverImageURL);
        }
        blog.coverImageURL = null;
        blog.coverImagePublicId = null;
      }

      // Save title, body, author, and image changes first
      await blog.save();

      // Route status change appropriately
      if (blog.type === "experience" && targetStatus !== originalStatus) {
        await setExperienceStatus(blog._id, targetStatus, req.user, "other", "Admin edit page status change");
      } else if (blog.type === "blog" && targetStatus !== originalStatus) {
        blog.status = targetStatus;
        await blog.save();
      }

      const freshBlog = await Blog.findById(blog._id);

      await logAudit({
        admin: req.user,
        action: "blog.edit",
        targetType: "blog",
        targetId: blog._id,
        targetLabel: freshBlog.title,
        before,
        after: { title: freshBlog.title, status: freshBlog.status, createdBy: String(freshBlog.createdBy) },
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
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.redirect("/admin/blogs");
    }
    const blog = await Blog.findById(req.params.id);
    if (!blog) return res.redirect("/admin/blogs");

    await deleteBlogsCascade(blog._id);

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

// POST /admin/blogs/bulk — bulk actions: delete, hide, publish, verify, unverify
router.post("/bulk", async (req, res) => {
  try {
    const { ids, action } = req.body;
    let idArr = [];
    if (Array.isArray(ids)) {
      idArr = ids;
    } else if (typeof ids === "string") {
      idArr = ids.includes(",") ? ids.split(",").map((s) => s.trim()) : [ids];
    }
    idArr = idArr.filter(Boolean);
    if (!idArr.length) return res.redirect("/admin/blogs");

    // Guard: Maximum 100 ids per request
    if (idArr.length > 100) {
      return res.status(400).render("error", {
        user: req.user,
        message: "Maximum 100 items per bulk action allowed.",
      });
    }

    // Guard: Every id must be a valid ObjectId
    const hasInvalidId = idArr.some((id) => !mongoose.Types.ObjectId.isValid(id));
    if (hasInvalidId) {
      return res.status(400).render("error", {
        user: req.user,
        message: "Invalid ID in bulk selection.",
      });
    }

    const objectIds = idArr.map((id) => new mongoose.Types.ObjectId(id));

    if (action === "delete") {
      const result = await deleteBlogsCascade(objectIds);
      await logAudit({
        admin: req.user,
        action: "blog.bulk_delete",
        targetType: "blog",
        targetLabel: `${result.deletedBlogs} blogs`,
        after: { count: result.deletedBlogs, ids: idArr.slice(0, 50) },
        ip: getIP(req),
      });
    } else if (action === "hide") {
      // Route experiences through moderation.hideExperience
      const expBlogs = await Blog.find({ _id: { $in: objectIds }, type: "experience" }).select("_id");
      let expModified = 0;
      for (const eb of expBlogs) {
        const res = await hideExperience(eb._id, req.user, "other", "Bulk hide");
        if (res && res.changed) expModified++;
      }
      const expIdSet = new Set(expBlogs.map((b) => b._id.toString()));
      const plainIds = objectIds.filter((id) => !expIdSet.has(id.toString()));
      let plainModified = 0;
      if (plainIds.length > 0) {
        const result = await Blog.updateMany({ _id: { $in: plainIds }, type: "blog" }, { $set: { status: "hidden" } });
        plainModified = result.modifiedCount || 0;
        if (plainModified > 0) {
          await logAudit({
            admin: req.user,
            action: "blog.bulk_hide",
            targetType: "blog",
            targetLabel: `${plainModified} blogs`,
            after: { count: plainModified, ids: plainIds.slice(0, 50).map(String) },
            ip: getIP(req),
          });
        }
      }
      if (req.flash) {
        if (expBlogs.length > 0 && plainIds.length > 0) {
          req.flash("success", `Bulk hide applied: ${expModified} experience(s), ${plainModified} blog(s).`);
        } else if (expBlogs.length > 0) {
          req.flash("success", `Bulk hide applied: ${expModified} experience(s).`);
        } else {
          req.flash("success", `Bulk hide applied: ${plainModified} blog(s).`);
        }
      }
      return res.redirect("/admin/blogs");
    } else if (action === "publish") {
      // Route experiences through moderation.publishExperience
      const expBlogs = await Blog.find({ _id: { $in: objectIds }, type: "experience" }).select("_id");
      let expModified = 0;
      for (const eb of expBlogs) {
        const res = await publishExperience(eb._id, req.user);
        if (res && res.changed) expModified++;
      }
      const expIdSet = new Set(expBlogs.map((b) => b._id.toString()));
      const plainIds = objectIds.filter((id) => !expIdSet.has(id.toString()));
      let plainModified = 0;
      if (plainIds.length > 0) {
        const result = await Blog.updateMany(
          { _id: { $in: plainIds }, type: "blog" },
          { $set: { status: "published" } }
        );
        plainModified = result.modifiedCount || 0;
        if (plainModified > 0) {
          await logAudit({
            admin: req.user,
            action: "blog.bulk_publish",
            targetType: "blog",
            targetLabel: `${plainModified} blogs`,
            after: { count: plainModified, ids: plainIds.slice(0, 50).map(String) },
            ip: getIP(req),
          });
        }
      }
      if (req.flash) {
        if (expBlogs.length > 0 && plainIds.length > 0) {
          req.flash("success", `Bulk publish applied: ${expModified} experience(s), ${plainModified} blog(s).`);
        } else if (expBlogs.length > 0) {
          req.flash("success", `Bulk publish applied: ${expModified} experience(s).`);
        } else {
          req.flash("success", `Bulk publish applied: ${plainModified} blog(s).`);
        }
      }
      return res.redirect("/admin/blogs");
    } else if (action === "verify") {
      await setVerified(objectIds, true, req.user);
    } else if (action === "unverify") {
      await setVerified(objectIds, false, req.user);
    }

    if (req.flash) req.flash("success", `Bulk action "${action}" applied.`);
    res.redirect("/admin/blogs");
  } catch (err) {
    console.error("Admin bulk action error:", err);
    res.redirect("/admin/blogs");
  }
});

module.exports = router;
