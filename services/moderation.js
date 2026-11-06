/**
 * services/moderation.js
 *
 * Centralized service for all experience status, moderation, and verification changes.
 * Enforces allowed transitions, atomic updates, report resolution, and audit logging.
 */

const mongoose = require("mongoose");
const Blog = require("../models/blog");
const Report = require("../models/report");
const { logAudit } = require("./auditLogger");

// Friendly reason labels mapping
const MODERATION_REASONS = {
  spam: "Spam",
  promotional: "Promotional content",
  "personal-info": "Contains personal information",
  abusive: "Abusive or harassing content",
  fake: "Appears to be fake",
  other: "Other",
};

function formatModerationReason(reason) {
  if (!reason) return null;
  return MODERATION_REASONS[reason] || "Other";
}

// In-memory 60s cache for open reports count badge
let cachedOpenReportsCount = 0;
let lastOpenReportsCheck = 0;
const CACHE_TTL_MS = 60 * 1000;

async function getOpenReportsCount() {
  const now = Date.now();
  if (now - lastOpenReportsCheck < CACHE_TTL_MS) {
    return cachedOpenReportsCount;
  }
  try {
    cachedOpenReportsCount = await Report.countDocuments({ status: "open" });
    lastOpenReportsCheck = now;
  } catch (err) {
    console.error("[moderation] Error fetching open reports count:", err.message);
  }
  return cachedOpenReportsCount;
}

function invalidateOpenReportsCache() {
  lastOpenReportsCheck = 0;
}

function getActorIp(actor) {
  return actor?.ip || actor?.req?.socket?.remoteAddress || "unknown";
}

/**
 * Hides an experience.
 * Allowed from: "published" or "featured" only.
 * Plain blogs (type: "blog") are untouched.
 */
async function hideExperience(blogId, actor, reason = null, note = "") {
  if (!mongoose.Types.ObjectId.isValid(blogId)) {
    return { changed: false, message: "Invalid experience ID." };
  }

  const sanitizedReason = reason && MODERATION_REASONS[reason] ? reason : (reason ? "other" : null);
  const sanitizedNote = note ? String(note).trim().slice(0, 200) : null;

  // Single conditional atomic update: from published or featured only, type experience only
  const blog = await Blog.findOneAndUpdate(
    {
      _id: blogId,
      type: "experience",
      status: { $in: ["published", "featured"] },
    },
    {
      $set: {
        status: "hidden",
        moderationReason: sanitizedReason,
        moderationNote: sanitizedNote,
      },
    },
    { new: false }
  );

  if (!blog) {
    const existing = await Blog.findById(blogId);
    if (!existing || existing.type !== "experience") {
      return { changed: false, message: "Experience not found or not an interview experience." };
    }
    if (existing.status === "hidden") {
      return { changed: false, message: "Experience is already hidden." };
    }
    return { changed: false, message: "Invalid status transition to hidden." };
  }

  // Exactly one caller succeeds: resolve open reports & invalidate cache
  const repResult = await Report.updateMany(
    { blog: blog._id, status: "open" },
    { $set: { status: "resolved", resolvedBy: actor._id, resolvedAt: new Date() } }
  );

  invalidateOpenReportsCache();

  await logAudit({
    admin: actor,
    action: "experience.hide",
    targetType: "blog",
    targetId: blog._id,
    targetLabel: blog.title,
    before: { status: blog.status, moderationReason: blog.moderationReason, reportsAffected: repResult.modifiedCount },
    after: { status: "hidden", moderationReason: sanitizedReason, reportsAffected: 0 },
    ip: getActorIp(actor),
  });

  return {
    changed: true,
    message: `Experience hidden and ${repResult.modifiedCount} open report(s) marked resolved.`,
    blog,
    affectedReports: repResult.modifiedCount,
  };
}

/**
 * Publishes an experience.
 * Allowed from: "hidden" only.
 * Plain blogs (type: "blog") are untouched.
 */
async function publishExperience(blogId, actor) {
  if (!mongoose.Types.ObjectId.isValid(blogId)) {
    return { changed: false, message: "Invalid experience ID." };
  }

  // Single conditional atomic update: from hidden only, type experience only
  const blog = await Blog.findOneAndUpdate(
    {
      _id: blogId,
      type: "experience",
      status: "hidden",
    },
    {
      $set: {
        status: "published",
        moderationReason: null,
        moderationNote: null,
      },
    },
    { new: false }
  );

  if (!blog) {
    const existing = await Blog.findById(blogId);
    if (!existing || existing.type !== "experience") {
      return { changed: false, message: "Experience not found or not an interview experience." };
    }
    if (existing.status === "published") {
      return { changed: false, message: "Experience is already published." };
    }
    return { changed: false, message: "Experience can only be published from hidden status." };
  }

  await logAudit({
    admin: actor,
    action: "experience.publish",
    targetType: "blog",
    targetId: blog._id,
    targetLabel: blog.title,
    before: { status: "hidden", moderationReason: blog.moderationReason },
    after: { status: "published", moderationReason: null },
    ip: getActorIp(actor),
  });

  return {
    changed: true,
    message: "Experience published successfully.",
    blog,
  };
}

/**
 * Features an experience.
 * Allowed from: "published" only.
 * Plain blogs (type: "blog") are untouched.
 */
async function featureExperience(blogId, actor) {
  if (!mongoose.Types.ObjectId.isValid(blogId)) {
    return { changed: false, message: "Invalid experience ID." };
  }

  // Single conditional atomic update: from published only, type experience only
  const blog = await Blog.findOneAndUpdate(
    {
      _id: blogId,
      type: "experience",
      status: "published",
    },
    {
      $set: { status: "featured" },
    },
    { new: false }
  );

  if (!blog) {
    const existing = await Blog.findById(blogId);
    if (!existing || existing.type !== "experience") {
      return { changed: false, message: "Experience not found or not an interview experience." };
    }
    if (existing.status === "featured") {
      return { changed: false, message: "Experience is already featured." };
    }
    return { changed: false, message: "Only published experiences can be featured." };
  }

  await logAudit({
    admin: actor,
    action: "experience.feature",
    targetType: "blog",
    targetId: blog._id,
    targetLabel: blog.title,
    before: { status: "published" },
    after: { status: "featured" },
    ip: getActorIp(actor),
  });

  return {
    changed: true,
    message: "Experience featured successfully.",
    blog,
  };
}

/**
 * Unfeatures an experience.
 * Allowed from: "featured" only.
 * Plain blogs (type: "blog") are untouched.
 */
async function unfeatureExperience(blogId, actor) {
  if (!mongoose.Types.ObjectId.isValid(blogId)) {
    return { changed: false, message: "Invalid experience ID." };
  }

  // Single conditional atomic update: from featured only, type experience only
  const blog = await Blog.findOneAndUpdate(
    {
      _id: blogId,
      type: "experience",
      status: "featured",
    },
    {
      $set: { status: "published" },
    },
    { new: false }
  );

  if (!blog) {
    const existing = await Blog.findById(blogId);
    if (!existing || existing.type !== "experience") {
      return { changed: false, message: "Experience not found or not an interview experience." };
    }
    if (existing.status !== "featured") {
      return { changed: false, message: "Experience is not currently featured." };
    }
    return { changed: false, message: "Invalid status transition." };
  }

  await logAudit({
    admin: actor,
    action: "experience.unfeature",
    targetType: "blog",
    targetId: blog._id,
    targetLabel: blog.title,
    before: { status: "featured" },
    after: { status: "published" },
    ip: getActorIp(actor),
  });

  return {
    changed: true,
    message: "Experience unfeatured successfully.",
    blog,
  };
}

/**
 * Sets verification status on experiences.
 * Allowed on any status.
 * Plain blogs (type: "blog") are skipped.
 * Supports single ID or array of IDs.
 */
async function setVerified(blogIds, value, actor) {
  const targetVal = Boolean(value);
  const rawList = Array.isArray(blogIds) ? blogIds : [blogIds];
  const validIds = rawList
    .map((id) => (id ? id.toString() : null))
    .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (validIds.length === 0) {
    return { changed: false, count: 0, message: "No valid experience IDs provided." };
  }

  // Single post mode
  if (!Array.isArray(blogIds)) {
    const blogId = validIds[0];
    const blog = await Blog.findOneAndUpdate(
      {
        _id: blogId,
        type: "experience",
        "experience.verified": { $ne: targetVal },
      },
      {
        $set: { "experience.verified": targetVal },
      },
      { new: false }
    );

    if (!blog) {
      const existing = await Blog.findById(blogId);
      if (!existing || existing.type !== "experience") {
        return { changed: false, message: "Experience not found or not an interview experience." };
      }
      return {
        changed: false,
        message: targetVal ? "Experience is already verified." : "Experience is not verified.",
      };
    }

    await logAudit({
      admin: actor,
      action: targetVal ? "experience.verify" : "experience.unverify",
      targetType: "blog",
      targetId: blog._id,
      targetLabel: blog.title,
      before: { verified: !targetVal },
      after: { verified: targetVal },
      ip: getActorIp(actor),
    });

    return {
      changed: true,
      count: 1,
      message: targetVal ? "Experience verified successfully." : "Experience unverified successfully.",
      blog,
    };
  }

  // Bulk mode: experiences only, skipping plain blogs
  const eligibleBlogs = await Blog.find({
    _id: { $in: validIds },
    type: "experience",
    "experience.verified": { $ne: targetVal },
  }).select("_id");

  const eligibleIds = eligibleBlogs.map((b) => b._id);
  if (eligibleIds.length === 0) {
    return { changed: false, count: 0, message: "No experiences required verification updates." };
  }

  const updateResult = await Blog.updateMany(
    { _id: { $in: eligibleIds } },
    { $set: { "experience.verified": targetVal } }
  );

  await logAudit({
    admin: actor,
    action: targetVal ? "experience.bulk_verify" : "experience.bulk_unverify",
    targetType: "blog",
    targetLabel: `${eligibleIds.length} experiences`,
    after: { count: eligibleIds.length, updated: updateResult.modifiedCount, ids: eligibleIds.slice(0, 50).map(String) },
    ip: getActorIp(actor),
  });

  return {
    changed: true,
    count: updateResult.modifiedCount,
    message: `Bulk ${targetVal ? "verify" : "unverify"} applied to ${updateResult.modifiedCount} experience(s).`,
  };
}

/**
 * Dismisses open reports on an experience.
 */
async function dismissReports(blogId, actor) {
  if (!mongoose.Types.ObjectId.isValid(blogId)) {
    return { changed: false, message: "Invalid experience ID." };
  }

  const blog = await Blog.findOne({ _id: blogId, type: "experience" });
  if (!blog) {
    return { changed: false, message: "Experience not found or not an interview experience." };
  }

  const result = await Report.updateMany(
    { blog: blog._id, status: "open" },
    { $set: { status: "dismissed", resolvedBy: actor._id, resolvedAt: new Date() } }
  );

  if (result.modifiedCount === 0) {
    return { changed: false, message: "No open reports to dismiss on this post." };
  }

  invalidateOpenReportsCache();

  await logAudit({
    admin: actor,
    action: "report.dismiss",
    targetType: "blog",
    targetId: blog._id,
    targetLabel: blog.title,
    before: { status: blog.status, reportsAffected: result.modifiedCount },
    after: { status: blog.status, reportsAffected: 0 },
    ip: getActorIp(actor),
  });

  return {
    changed: true,
    message: `Dismissed ${result.modifiedCount} open report(s).`,
    affectedReports: result.modifiedCount,
  };
}

/**
 * Sets experience status to targetStatus by chaining legal steps.
 * Valid target statuses: "published", "hidden", "featured".
 * Returns { changed: boolean, message: string }.
 */
async function setExperienceStatus(blogId, targetStatus, actor, reason = "other", note = "") {
  if (!mongoose.Types.ObjectId.isValid(blogId)) {
    return { changed: false, message: "Invalid experience ID." };
  }
  if (!["published", "hidden", "featured"].includes(targetStatus)) {
    return { changed: false, message: "Invalid target status." };
  }

  const blog = await Blog.findById(blogId).select("status type");
  if (!blog || blog.type !== "experience") {
    return { changed: false, message: "Experience not found or not an interview experience." };
  }

  if (blog.status === targetStatus) {
    return { changed: false, message: "Status unchanged." };
  }

  // Chain legal steps according to current status and target status
  if (targetStatus === "hidden") {
    // Both published and featured can transition to hidden via hideExperience
    return await hideExperience(blogId, actor, reason, note);
  }

  if (targetStatus === "published") {
    if (blog.status === "hidden") {
      return await publishExperience(blogId, actor);
    }
    if (blog.status === "featured") {
      return await unfeatureExperience(blogId, actor);
    }
  }

  if (targetStatus === "featured") {
    if (blog.status === "published") {
      return await featureExperience(blogId, actor);
    }
    if (blog.status === "hidden") {
      // Step 1: publish
      const step1 = await publishExperience(blogId, actor);
      if (!step1.changed) return step1;
      // Step 2: feature
      const step2 = await featureExperience(blogId, actor);
      return step2;
    }
  }

  return { changed: false, message: `Transition from ${blog.status} to ${targetStatus} is not supported.` };
}

module.exports = {
  MODERATION_REASONS,
  formatModerationReason,
  getOpenReportsCount,
  invalidateOpenReportsCache,
  hideExperience,
  publishExperience,
  featureExperience,
  unfeatureExperience,
  setVerified,
  dismissReports,
  setExperienceStatus,
};
