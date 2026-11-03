#!/usr/bin/env node
/**
 * scripts/checkImages.js
 *
 * Verifies integrity of all blog cover images.
 * - Local files: checks physical existence on disk.
 * - Remote URLs: verifies HTTP 200 status and image/* Content-Type.
 *
 * Usage:
 *   npm run check-images
 *   npm run check-images -- --fix
 */
require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");

const isFixMode = process.argv.includes("--fix");

function checkRemoteUrl(urlStr, timeoutMs = 7000) {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(urlStr);
      const client = parsedUrl.protocol === "https:" ? https : http;

      const req = client.request(
        parsedUrl,
        {
          method: "HEAD",
          timeout: timeoutMs,
          headers: { "User-Agent": "Blogify-Image-Health-Check/1.0" },
        },
        (res) => {
          // If HEAD is not allowed, retry with GET
          if (res.statusCode === 405 || res.statusCode === 403) {
            client.get(parsedUrl, { timeout: timeoutMs }, (getRes) => {
              getRes.resume(); // consume response data to free memory
              const is200 = getRes.statusCode >= 200 && getRes.statusCode < 400;
              const contentType = getRes.headers["content-type"] || "";
              const isImage = contentType.startsWith("image/");
              resolve({
                ok: is200 && isImage,
                status: getRes.statusCode,
                contentType,
                reason: !is200 ? `HTTP ${getRes.statusCode}` : !isImage ? `Non-image Content-Type: ${contentType}` : null,
              });
            }).on("error", (err) => resolve({ ok: false, reason: err.message }));
            return;
          }

          const is200 = res.statusCode >= 200 && res.statusCode < 400;
          const contentType = res.headers["content-type"] || "";
          const isImage = contentType.startsWith("image/") || contentType === "application/octet-stream";
          resolve({
            ok: is200 && isImage,
            status: res.statusCode,
            contentType,
            reason: !is200 ? `HTTP ${res.statusCode}` : !isImage ? `Non-image Content-Type: ${contentType}` : null,
          });
        }
      );

      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, reason: "Request timed out" });
      });

      req.on("error", (err) => {
        resolve({ ok: false, reason: err.message });
      });

      req.end();
    } catch (err) {
      resolve({ ok: false, reason: "Invalid URL: " + err.message });
    }
  });
}

async function runHealthCheck() {
  const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017/blogify";
  console.log("====================================================");
  console.log("       BLOGIFY COVER IMAGE HEALTH CHECK");
  console.log("====================================================");
  if (isFixMode) {
    console.log("🔧 Mode: FIX ENABLED (--fix) -> Broken covers will be reset to null");
  } else {
    console.log("🔍 Mode: INSPECTION (run with -- --fix to repair broken links)");
  }
  console.log("Connecting to MongoDB...");

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected to database successfully.\n");

  const Blog = require("../models/blog");
  const blogs = await Blog.find({});

  console.log(`Found ${blogs.length} total blog posts to verify.\n`);

  let validCount = 0;
  let missingLocalCount = 0;
  let brokenRemoteCount = 0;
  let noCoverCount = 0;
  const brokenBlogs = [];

  for (const blog of blogs) {
    const rawUrl = blog.coverImageURL;

    if (!rawUrl || !rawUrl.trim()) {
      noCoverCount++;
      continue;
    }

    const clean = rawUrl.trim();

    // 1. Remote Image Check
    if (clean.startsWith("http://") || clean.startsWith("https://")) {
      const result = await checkRemoteUrl(clean);
      if (result.ok) {
        validCount++;
        console.log(`  [OK] "${blog.title}" -> Remote image verified (${result.contentType})`);
      } else {
        brokenRemoteCount++;
        brokenBlogs.push({ blog, reason: result.reason, type: "remote" });
        console.log(`  [BROKEN] "${blog.title}" -> ${result.reason} [${clean}]`);
      }
      continue;
    }

    // 2. Local File Check
    let relPath = clean;
    if (relPath.startsWith("/")) relPath = relPath.slice(1);
    if (relPath.startsWith("public/")) relPath = relPath.replace(/^public\//, "");

    const absPath = path.resolve("./public", relPath);
    const exists = fs.existsSync(absPath);

    if (exists) {
      validCount++;
      console.log(`  [OK] "${blog.title}" -> Local file exists on disk: ${relPath}`);
    } else {
      missingLocalCount++;
      brokenBlogs.push({ blog, reason: "Local file missing from disk", type: "local", path: absPath });
      console.log(`  [BROKEN] "${blog.title}" -> Local file missing from disk [${clean}]`);
    }
  }

  console.log("\n----------------------------------------------------");
  console.log("SUMMARY REPORT:");
  console.log(`  Total Blogs:        ${blogs.length}`);
  console.log(`  Valid Covers:       ${validCount}`);
  console.log(`  No Cover Assigned:  ${noCoverCount} (Uses default placeholder)`);
  console.log(`  Broken Local Files: ${missingLocalCount}`);
  console.log(`  Broken Remote URLs: ${brokenRemoteCount}`);
  console.log("----------------------------------------------------");

  if (brokenBlogs.length === 0) {
    console.log("✅ All blog covers are healthy! Zero broken images detected.\n");
    await mongoose.disconnect();
    process.exit(0);
  }

  if (isFixMode) {
    console.log(`\n🔧 Repairing ${brokenBlogs.length} broken blog cover reference(s)...`);
    for (const item of brokenBlogs) {
      await Blog.findByIdAndUpdate(item.blog._id, {
        $set: { coverImageURL: null, coverImagePublicId: null },
      });
      console.log(`  ✔ Repaired "${item.blog.title}": coverImageURL reset to null (now displays placeholder cleanly).`);
    }
    console.log("\n✅ Fix applied successfully! All broken references cleared.\n");
    await mongoose.disconnect();
    process.exit(0);
  } else {
    console.error(
      `\n❌ Found ${brokenBlogs.length} broken cover image reference(s)! Run "npm run check-images -- --fix" to clean them up.\n`
    );
    await mongoose.disconnect();
    process.exit(1);
  }
}

runHealthCheck().catch((err) => {
  console.error("Health check execution failed:", err);
  process.exit(1);
});

