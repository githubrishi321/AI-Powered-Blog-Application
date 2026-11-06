const { Router } = require("express");
const path = require("path");
const router = Router();
const mongoose = require("mongoose");
const Blog = require("../models/blog");
const Comment = require("../models/comment");
const { isAuthenticated } = require("../middlewares/authentication");
const { uploadCover, upload: storeImage, remove: removeImage } = require("../services/imageStorage");
const { doubleCsrfProtection } = require("../middlewares/csrf");

router.get("/add-new", isAuthenticated, (req, res) => {
  return res.render("addBlog", {
    user: req.user,
  });
});

router.get("/test/user", isAuthenticated, (req, res) => {
  res.json({
    user: req.user,
    userId: req.user._id,
    userType: typeof req.user._id,
  });
});

router.post(
  "/",
  isAuthenticated,
  (req, res, next) => {
    uploadCover.single("coverImage")(req, res, (err) => {
      if (err) {
        return res.status(400).render("addBlog", {
          user: req.user,
          error:
            err.code === "LIMIT_FILE_SIZE"
              ? "File too large. Maximum image size is 5MB."
              : err.message,
        });
      }
      next();
    });
  },
  doubleCsrfProtection,
  async (req, res) => {
    let uploaded = null;
    try {
      const { title, body } = req.body;

      if (!title || !body) {
        return res.status(400).render("addBlog", {
          user: req.user,
          error: "Title and body are required",
        });
      }

      const blogData = {
        body,
        title,
        createdBy: req.user._id,
        type: "blog",
      };

      if (req.file) {
        uploaded = await storeImage(req.file.buffer, req.file.mimetype);
        blogData.coverImageURL = uploaded.url;
        blogData.coverImagePublicId = uploaded.publicId;
      }

      try {
        const blog = await Blog.create(blogData);
        return res.redirect(`/blog/${blog._id}`);
      } catch (dbError) {
        // Rollback uploaded asset if database save fails
        if (uploaded && uploaded.publicId) {
          await removeImage(uploaded.publicId);
        }
        throw dbError;
      }
    } catch (error) {
      console.error("Error creating blog:", error);
      return res.status(500).render("addBlog", {
        user: req.user,
        error: error.message || "Error creating blog",
      });
    }
  }
);

router.get("/:id", async function (req, res) {
  try {
    const blog = await Blog.findById(req.params.id).populate("createdBy");

    if (!blog) {
      return res.status(404).render("error", {
        user: req.user,
        message: "Blog not found",
      });
    }

    if (blog.type === "experience") {
      return res.redirect(`/experiences/${blog._id}`);
    }

    const comments = await Comment.find({ blogId: req.params.id }).populate(
      "createdBy"
    );

    return res.render("blog", {
      user: req.user,
      blog: blog,
      comments: comments,
    });
  } catch (error) {
    console.error("Error fetching blog:", error);
    return res.status(500).render("error", {
      user: req.user,
      message: "Error loading blog",
    });
  }
});

router.post("/comment/:blogId", isAuthenticated, doubleCsrfProtection, async function (req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.blogId)) {
      return res.status(404).render("error", {
        user: req.user,
        message: "Blog not found",
      });
    }

    const blog = await Blog.findById(req.params.blogId).select("type status createdBy");
    if (!blog) {
      return res.status(404).render("error", {
        user: req.user,
        message: "Blog not found",
      });
    }

    if (blog.type === "experience" && blog.status === "hidden") {
      const isOwner = req.user && String(req.user._id) === String(blog.createdBy);
      const isAdmin = req.user && req.user.role === "ADMIN";
      if (!isOwner && !isAdmin) {
        return res.status(404).render("error", {
          user: req.user,
          message: "Experience not found",
        });
      }
    }

    const { content } = req.body;
    const redirectUrl = blog.type === "experience"
      ? `/experiences/${req.params.blogId}`
      : `/blog/${req.params.blogId}`;

    if (!content || content.trim() === "") {
      return res.status(400).redirect(redirectUrl);
    }

    await Comment.create({
      content: content.trim(),
      blogId: blog._id,
      createdBy: new mongoose.Types.ObjectId(req.user._id),
    });

    res.redirect(redirectUrl);
  } catch (error) {
    console.error("Error creating comment:", error);
    return res.status(500).render("error", {
      user: req.user,
      message: "Error creating comment",
    });
  }
});

module.exports = router;
