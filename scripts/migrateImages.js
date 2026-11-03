#!/usr/bin/env node
/**
 * scripts/migrateImages.js
 *
 * Migrates local blog cover images to Cloudinary persistent storage.
 * - For existing local files: reads file buffer, uploads to Cloudinary, updates MongoDB record.
 * - For missing local files: safely sets coverImageURL to null so clean placeholder renders.
 *
 * Usage:
 *   npm run migrate:images -- --dry-run
 *   npm run migrate:images
 */
require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const { upload, isCloudinaryConfigured } = require("../services/imageStorage");

const isDryRun = process.argv.includes("--dry-run");

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

async function runMigration() {
  console.log("===============================================================");
  console.log("       BLOGIFY COVER IMAGE STORAGE MIGRATION");
  console.log("===============================================================");
  console.log("\n⚠️  IMPORTANT REMINDER:");
  console.log("   Before running any production migration, please ensure you");
  console.log("   have taken a full backup of your MongoDB database!\n");

  if (isDryRun) {
    console.log("🔍 Running in DRY-RUN mode. No changes will be written to MongoDB.\n");
  } else {
    console.log("🚀 Running in LIVE mode. Documents will be updated.\n");
  }

  const cloudinaryReady = isCloudinaryConfigured();
  if (cloudinaryReady) {
    console.log("✔ Cloudinary credentials detected and ready for upload.\n");
  } else {
    console.warn("⚠️  CLOUDINARY credentials NOT found in environment.");
    console.warn("   Existing local files will remain local. Missing files will be nullified.\n");
  }

  const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017/blogify";
  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected.\n");

  const Blog = require("../models/blog");
  const blogs = await Blog.find({});

  console.log(`Analyzing ${blogs.length} blog posts...\n`);

  let alreadyCloudCount = 0;
  let migratedToCloudCount = 0;
  let missingFilesCount = 0;
  let noCoverCount = 0;
  let keptLocalCount = 0;

  for (const blog of blogs) {
    const rawUrl = blog.coverImageURL;

    if (!rawUrl || !rawUrl.trim()) {
      noCoverCount++;
      continue;
    }

    const clean = rawUrl.trim();

    // 1. Already on Cloudinary / Remote
    if (clean.startsWith("http://") || clean.startsWith("https://")) {
      alreadyCloudCount++;
      console.log(`  [SKIP] "${blog.title}" -> Already hosted remotely: ${clean.substring(0, 50)}...`);
      continue;
    }

    // 2. Local File
    let relPath = clean;
    if (relPath.startsWith("/")) relPath = relPath.slice(1);
    if (relPath.startsWith("public/")) relPath = relPath.replace(/^public\//, "");

    const absPath = path.resolve("./public", relPath);
    const exists = fs.existsSync(absPath);

    if (exists) {
      if (cloudinaryReady) {
        console.log(`  [MIGRATE] "${blog.title}" -> Local file found (${relPath}). Uploading to Cloudinary...`);
        if (!isDryRun) {
          try {
            const buffer = await fs.promises.readFile(absPath);
            const mimetype = getMimeTypeFromFilename(absPath);
            const uploaded = await upload(buffer, mimetype, { folder: "blogify_covers" });

            await Blog.findByIdAndUpdate(blog._id, {
              $set: {
                coverImageURL: uploaded.url,
                coverImagePublicId: uploaded.publicId,
              },
            });
            console.log(`    ✔ Success: ${uploaded.url}`);
            migratedToCloudCount++;
          } catch (uploadErr) {
            console.error(`    ❌ Upload failed:`, uploadErr.message);
          }
        } else {
          console.log(`    [DRY-RUN] Would upload ${relPath} to Cloudinary and update record.`);
          migratedToCloudCount++;
        }
      } else {
        keptLocalCount++;
        console.log(`  [KEEP LOCAL] "${blog.title}" -> File exists on disk, but Cloudinary is not configured.`);
      }
    } else {
      // 3. Local file is missing on disk
      missingFilesCount++;
      console.log(`  [MISSING FILE] "${blog.title}" -> File "${clean}" is missing on disk!`);
      if (!isDryRun) {
        await Blog.findByIdAndUpdate(blog._id, {
          $set: { coverImageURL: null, coverImagePublicId: null },
        });
        console.log(`    ✔ Reset coverImageURL to null (clean placeholder will render).`);
      } else {
        console.log(`    [DRY-RUN] Would reset coverImageURL to null so placeholder shows cleanly.`);
      }
    }
  }

  console.log("\n===============================================================");
  console.log("MIGRATION SUMMARY:");
  console.log(`  Total Blogs Inspected:          ${blogs.length}`);
  console.log(`  Already Remote / Cloudinary:    ${alreadyCloudCount}`);
  console.log(`  Uploaded to Cloudinary:         ${migratedToCloudCount}`);
  console.log(`  Retained on Local Disk:         ${keptLocalCount}`);
  console.log(`  Missing Files Handled:          ${missingFilesCount}`);
  console.log(`  No Cover Set Initially:         ${noCoverCount}`);
  console.log("===============================================================\n");

  if (isDryRun) {
    console.log("🔍 Dry run completed with 0 database modifications.");
    console.log("   Run without --dry-run to apply these updates.\n");
  } else {
    console.log("✅ Migration completed successfully.\n");
  }

  await mongoose.disconnect();
}

runMigration().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

