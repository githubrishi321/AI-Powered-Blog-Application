const mongoose = require("mongoose");
const Blog = require("../models/blog");
const Comment = require("../models/comment");
const Report = require("../models/report");
const { remove: removeImage } = require("./imageStorage");
const { invalidateOpenReportsCache } = require("./moderation");

/**
 * Shared delete cascade service:
 * Deletes blogs, their associated comments, reports, and cover images from storage.
 *
 * @param {string|string[]|mongoose.Types.ObjectId|mongoose.Types.ObjectId[]} blogIds - Blog ID or array of IDs to delete
 * @returns {Promise<{ deletedBlogs: number, deletedComments: number, deletedReports: number, removedImages: number }>}
 */
async function deleteBlogsCascade(blogIds) {
  const rawList = Array.isArray(blogIds) ? blogIds : [blogIds];
  const validIds = rawList
    .map((id) => (id ? id.toString() : null))
    .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (validIds.length === 0) {
    return {
      deletedBlogs: 0,
      deletedComments: 0,
      deletedReports: 0,
      removedImages: 0,
    };
  }

  // 1. Retrieve blogs to find cover image references
  let removedImages = 0;
  try {
    const blogs = await Blog.find(
      { _id: { $in: validIds } },
      "_id coverImagePublicId coverImageURL"
    ).lean();

    for (const b of blogs) {
      const publicId =
        b.coverImagePublicId ||
        (b.coverImageURL && b.coverImageURL.startsWith("/uploads/")
          ? b.coverImageURL.replace("/uploads/", "")
          : null);

      if (publicId) {
        try {
          await removeImage(publicId).catch(() => {});
          removedImages++;
        } catch (_) {
          // Best effort; never blocks blog deletion
        }
      }
    }
  } catch (err) {
    console.error("[blogCleanup] Error scanning cover images:", err.message);
  }

  // 2. Cascade delete comments, reports, and blogs
  const [delComments, delReports, delBlogs] = await Promise.all([
    Comment.deleteMany({ blogId: { $in: validIds } }),
    Report.deleteMany({ blog: { $in: validIds } }),
    Blog.deleteMany({ _id: { $in: validIds } }),
  ]);

  invalidateOpenReportsCache();

  return {
    deletedBlogs: delBlogs.deletedCount || 0,
    deletedComments: delComments.deletedCount || 0,
    deletedReports: delReports.deletedCount || 0,
    removedImages,
  };
}

module.exports = {
  deleteBlogsCascade,
};

