#!/usr/bin/env node
/**
 * scripts/setCover.js
 *
 * One-off CLI script to set or recover a blog's cover image.
 *
 * Usage:
 *   node scripts/setCover.js <blogId> <path/to/image.png>
 *
 * Example:
 *   node scripts/setCover.js 6a9128d78d20abdccadf6dac ./my-study-cover.png
 */
require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const { upload, remove } = require("../services/imageStorage");

const [blogId, imageFilePath] = process.argv.slice(2);

function getMimeTypeFromFilename(filename) {
  const ext = path.extname(filename).toLowerCase().replace(".", "");
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}

async function setCover() {
  if (!blogId || !imageFilePath) {
    console.error("Usage: node scripts/setCover.js <blogId> <path-to-image-file>");
    process.exit(1);
  }

  const resolvedFilePath = path.resolve(imageFilePath);
  if (!fs.existsSync(resolvedFilePath)) {
    console.error(`Error: File not found at path "${resolvedFilePath}"`);
    process.exit(1);
  }

  const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017/blogify";
  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10000 });

  const Blog = require("../models/blog");
  const blog = await Blog.findById(blogId);

  if (!blog) {
    console.error(`Error: No blog found with ID "${blogId}"`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Found blog: "${blog.title}" (${blog._id})`);
  console.log(`Reading image file: ${resolvedFilePath}...`);

  const buffer = await fs.promises.readFile(resolvedFilePath);
  const mimetype = getMimeTypeFromFilename(resolvedFilePath);

  console.log("Uploading cover image to storage...");
  const uploaded = await upload(buffer, mimetype, { folder: "blogify_covers" });

  // Clean up previous asset if it had one
  if (blog.coverImagePublicId) {
    await remove(blog.coverImagePublicId);
  }

  blog.coverImageURL = uploaded.url;
  blog.coverImagePublicId = uploaded.publicId;
  await blog.save();

  console.log("-------------------------------------------------------");
  console.log("✅ Successfully updated blog cover image!");
  console.log(`   Blog:      "${blog.title}"`);
  console.log(`   Cover URL: ${uploaded.url}`);
  console.log(`   Public ID: ${uploaded.publicId}`);
  console.log("-------------------------------------------------------");

  await mongoose.disconnect();
}

setCover().catch((err) => {
  console.error("setCover failed:", err);
  process.exit(1);
});

