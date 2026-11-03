const { Router } = require("express");
const router = Router();
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const User = require("../../models/user");
const Blog = require("../../models/blog");
const Comment = require("../../models/comment");
const { logAudit } = require("../../services/auditLogger");
const { removeImage } = require("../../services/imageStorage");
const { body, validationResult } = require("express-validator");

// Multer for profile image uploads in admin
const uploadsDir = path.resolve("./public/uploads");
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images allowed"), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

function getIP(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

function generateTempPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// GET /admin/users — list with search, filter, sort, pagination
router.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;
    const { search, role, status, sort } = req.query;

    const query = {};
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [{ fullName: re }, { email: re }];
    }
    if (role && ["USER", "ADMIN"].includes(role)) query.role = role;
    if (status && ["active", "suspended", "banned"].includes(status)) query.status = status;

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      name: { fullName: 1 },
      email: { email: 1 },
    };
    const sortOpt = sortMap[sort] || { createdAt: -1 };

    const [users, total] = await Promise.all([
      User.find(query).sort(sortOpt).skip(skip).limit(limit).select("-password -salt"),
      User.countDocuments(query),
    ]);

    res.render("admin/users/list", {
      user: req.user,
      users,
      total,
      page,
      pages: Math.ceil(total / limit),
      query: req.query,
      flash: req.flash ? req.flash() : {},
    });
  } catch (err) {
    console.error(err);
    res.status(500).render("error", { user: req.user, message: "Failed to load users." });
  }
});

// GET /admin/users/create
router.get("/create", (req, res) => {
  res.render("admin/users/create", {
    user: req.user,
    errors: [],
    flash: req.flash ? req.flash() : {},
  });
});

// POST /admin/users/create
router.post(
  "/create",
  [
    body("fullName").trim().notEmpty().withMessage("Full name is required").escape(),
    body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("role").isIn(["USER", "ADMIN"]).withMessage("Invalid role"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render("admin/users/create", {
        user: req.user,
        errors: errors.array(),
        flash: {},
      });
    }
    try {
      const { fullName, email, password, role } = req.body;
      const newUser = await User.create({ fullName, email, password, role });
      await logAudit({
        admin: req.user,
        action: "user.create",
        targetType: "user",
        targetId: newUser._id,
        targetLabel: email,
        after: { fullName, email, role },
        ip: getIP(req),
      });
      if (req.flash) req.flash("success", `User ${email} created successfully.`);
      res.redirect("/admin/users");
    } catch (err) {
      const msg = err.code === 11000 ? "Email already exists." : "Error creating user.";
      res.render("admin/users/create", { user: req.user, errors: [{ msg }], flash: {} });
    }
  }
);

// GET /admin/users/:id
router.get("/:id", async (req, res) => {
  try {
    const target = await User.findById(req.params.id).select("-password -salt");
    if (!target) return res.status(404).render("error", { user: req.user, message: "User not found." });

    const [blogCount, commentCount] = await Promise.all([
      Blog.countDocuments({ createdBy: target._id }),
      Comment.countDocuments({ createdBy: target._id }),
    ]);

    res.render("admin/users/detail", {
      user: req.user,
      target,
      blogCount,
      commentCount,
      flash: req.flash ? req.flash() : {},
      passwordReset: false,
      tempPassword: null,
    });
  } catch (err) {
    res.status(500).render("error", { user: req.user, message: "Failed to load user." });
  }
});

// GET /admin/users/:id/edit
router.get("/:id/edit", async (req, res) => {
  try {
    const target = await User.findById(req.params.id).select("-password -salt");
    if (!target) return res.status(404).render("error", { user: req.user, message: "User not found." });
    res.render("admin/users/edit", {
      user: req.user,
      target,
      errors: [],
      flash: req.flash ? req.flash() : {},
    });
  } catch (err) {
    res.status(500).render("error", { user: req.user, message: "Failed to load user." });
  }
});

// POST /admin/users/:id/edit
router.post(
  "/:id/edit",
  upload.single("profileImage"),
  [
    body("fullName").trim().notEmpty().withMessage("Full name is required").escape(),
    body("email").isEmail().withMessage("Valid email required").normalizeEmail(),
    body("role").isIn(["USER", "ADMIN"]).withMessage("Invalid role"),
    body("status").isIn(["active", "suspended", "banned"]).withMessage("Invalid status"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    const target = await User.findById(req.params.id).select("-password -salt").catch(() => null);
    if (!target) return res.status(404).render("error", { user: req.user, message: "User not found." });

    if (!errors.isEmpty()) {
      return res.render("admin/users/edit", { user: req.user, target, errors: errors.array(), flash: {} });
    }

    try {
      // Safety: admin cannot demote themselves
      const isSelf = String(req.user._id) === String(target._id);
      if (isSelf && req.body.role !== "ADMIN") {
        return res.render("admin/users/edit", {
          user: req.user, target,
          errors: [{ msg: "You cannot change your own role." }], flash: {},
        });
      }

      // Safety: last admin cannot be demoted
      if (target.role === "ADMIN" && req.body.role !== "ADMIN") {
        const adminCount = await User.countDocuments({ role: "ADMIN" });
        if (adminCount <= 1) {
          return res.render("admin/users/edit", {
            user: req.user, target,
            errors: [{ msg: "Cannot demote the last admin." }], flash: {},
          });
        }
      }

      const before = { fullName: target.fullName, email: target.email, role: target.role, status: target.status };
      const updates = {
        fullName: req.body.fullName,
        email: req.body.email,
        role: req.body.role,
        status: req.body.status,
      };

      // Status change → bump tokenVersion
      if (target.status !== req.body.status || target.role !== req.body.role) {
        updates.$inc = { tokenVersion: 1 };
      }

      if (req.file) {
        // Remove old profile image if it's not the default
        if (target.profileImageURL && !target.profileImageURL.includes("default")) {
          const oldPath = path.resolve("./public" + target.profileImageURL);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        updates.profileImageURL = `/uploads/${req.file.filename}`;
      }

      if (req.body.removeProfileImage === "1") {
        if (target.profileImageURL && !target.profileImageURL.includes("default")) {
          const oldPath = path.resolve("./public" + target.profileImageURL);
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        updates.profileImageURL = "/Images/default.svg";
      }

      await User.findByIdAndUpdate(req.params.id, updates);

      await logAudit({
        admin: req.user,
        action: "user.edit",
        targetType: "user",
        targetId: target._id,
        targetLabel: target.email,
        before,
        after: { fullName: updates.fullName, email: updates.email, role: updates.role, status: updates.status },
        ip: getIP(req),
      });

      if (req.flash) req.flash("success", "User updated successfully.");
      res.redirect(`/admin/users/${req.params.id}`);
    } catch (err) {
      console.error(err);
      res.render("admin/users/edit", {
        user: req.user, target,
        errors: [{ msg: "Error updating user." }], flash: {},
      });
    }
  }
);

// POST /admin/users/:id/reset-password
router.post("/:id/reset-password", async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).render("error", { user: req.user, message: "User not found." });

    let newPassword = req.body.newPassword;
    let isGenerated = false;
    if (!newPassword || newPassword.trim().length < 6) {
      newPassword = generateTempPassword();
      isGenerated = true;
    }

    // Use the same hashing logic as the pre-save hook
    const salt = process.env.PASSWORD_SALT || "secretKey";
    const hashedPassword = crypto.createHmac("sha256", salt).update(newPassword).digest("hex");

    // Bump tokenVersion to invalidate all existing sessions
    await User.findByIdAndUpdate(req.params.id, {
      password: hashedPassword,
      salt,
      $inc: { tokenVersion: 1 },
    });

    await logAudit({
      admin: req.user,
      action: "user.password_reset",
      targetType: "user",
      targetId: target._id,
      targetLabel: target.email,
      ip: getIP(req),
    });

    // Show the temp password once (if generated)
    res.render("admin/users/detail", {
      user: req.user,
      target: await User.findById(req.params.id).select("-password -salt"),
      blogCount: await Blog.countDocuments({ createdBy: target._id }),
      commentCount: await Comment.countDocuments({ createdBy: target._id }),
      flash: {},
      tempPassword: isGenerated ? newPassword : null,
      passwordReset: true,
    });
  } catch (err) {
    console.error(err);
    res.redirect(`/admin/users/${req.params.id}`);
  }
});

// POST /admin/users/:id/force-logout
router.post("/:id/force-logout", async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    await User.findByIdAndUpdate(req.params.id, { $inc: { tokenVersion: 1 } });
    await logAudit({
      admin: req.user,
      action: "user.force_logout",
      targetType: "user",
      targetId: target._id,
      targetLabel: target.email,
      ip: getIP(req),
    });
    if (req.flash) req.flash("success", "User forcibly logged out.");
    res.redirect(`/admin/users/${req.params.id}`);
  } catch (err) {
    res.redirect(`/admin/users/${req.params.id}`);
  }
});

// POST /admin/users/:id/unlock
router.post("/:id/unlock", async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).render("error", { user: req.user, message: "User not found." });
    await User.findByIdAndUpdate(req.params.id, {
      $set: { failedLoginAttempts: 0, lockUntil: null },
    });
    await logAudit({
      admin: req.user,
      action: "user.unlock",
      targetType: "user",
      targetId: target._id,
      targetLabel: target.email,
      ip: getIP(req),
    });
    if (req.flash) req.flash("success", "Account unlocked.");
    res.redirect(`/admin/users/${req.params.id}`);
  } catch (err) {
    res.redirect(`/admin/users/${req.params.id}`);
  }
});

// POST /admin/users/:id/delete
router.post("/:id/delete", async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).render("error", { user: req.user, message: "User not found." });

    // Safety: admin cannot delete themselves
    if (String(req.user._id) === String(target._id)) {
      if (req.flash) req.flash("error", "You cannot delete your own account.");
      return res.redirect(`/admin/users/${req.params.id}`);
    }

    // Safety: last admin cannot be deleted
    if (target.role === "ADMIN") {
      const adminCount = await User.countDocuments({ role: "ADMIN" });
      if (adminCount <= 1) {
        if (req.flash) req.flash("error", "Cannot delete the last admin.");
        return res.redirect(`/admin/users/${req.params.id}`);
      }
    }

    const { contentAction, reassignTo } = req.body;

    if (contentAction === "reassign" && reassignTo) {
      // Reassign blogs and comments to another user
      const reassignUser = await User.findById(reassignTo);
      if (reassignUser) {
        await Blog.updateMany({ createdBy: target._id }, { $set: { createdBy: reassignTo } });
        await Comment.updateMany({ createdBy: target._id }, { $set: { createdBy: reassignTo } });
      }
    } else {
      // Default: Delete all blogs (and cover images) and comments
      const blogs = await Blog.find({ createdBy: target._id });
      for (const blog of blogs) {
        if (blog.coverImagePublicId) {
          await removeImage(blog.coverImagePublicId);
        } else if (blog.coverImageURL) {
          await removeImage(blog.coverImageURL);
        }
        await Blog.findByIdAndDelete(blog._id);
        await Comment.deleteMany({ blogId: blog._id });
      }
      await Comment.deleteMany({ createdBy: target._id });
    }

    // Clean up local avatar if any
    if (target.profileImageURL && target.profileImageURL.startsWith("/uploads/")) {
      const pPath = path.resolve("./public" + target.profileImageURL);
      if (fs.existsSync(pPath)) {
        try { fs.unlinkSync(pPath); } catch (e) {}
      }
    }

    await User.findByIdAndDelete(req.params.id);

    await logAudit({
      admin: req.user,
      action: "user.delete",
      targetType: "user",
      targetId: target._id,
      targetLabel: target.email,
      before: { fullName: target.fullName, email: target.email, role: target.role },
      ip: getIP(req),
    });

    if (req.flash) req.flash("success", `User ${target.email} deleted.`);
    res.redirect("/admin/users");
  } catch (err) {
    console.error(err);
    res.redirect("/admin/users");
  }
});

module.exports = router;

