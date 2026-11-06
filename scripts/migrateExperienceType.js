/**
 * Migration Script: Set type: "blog" for legacy documents missing the type field.
 *
 * Safety Notes:
 * - Always BACK UP your MongoDB database before running migrations in production.
 * - Ensure you have committed your current working git tree.
 * - This script is IDEMPOTENT. Running it multiple times has no additional effect.
 *
 * Usage:
 *   Dry run: node scripts/migrateExperienceType.js --dry-run
 *   Real:    node scripts/migrateExperienceType.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Blog = require("../models/blog");

async function migrate() {
  const isDryRun = process.argv.includes("--dry-run");

  console.log("==================================================");
  console.log("  MIGRATION: Set type='blog' on legacy posts      ");
  console.log("==================================================");
  if (isDryRun) {
    console.log("[MODE] DRY-RUN MODE: No changes will be written to the database.");
  } else {
    console.log("[MODE] LIVE EXECUTION: Updating documents in MongoDB.");
    console.log("[REMINDER] Ensure your database is backed up and your git status is clean!");
  }

  const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017/blogify";
  console.log("[DB] Connecting to MongoDB...");
  await mongoose.connect(mongoUrl);
  console.log("[DB] Connected successfully.");

  try {
    // Match any document where type is null, empty, or field does not exist
    const query = {
      $or: [
        { type: { $exists: false } },
        { type: null },
        { type: "" },
      ],
    };

    const matchedCount = await Blog.countDocuments(query);
    console.log(`[INFO] Matched documents needing migration: ${matchedCount}`);

    if (isDryRun) {
      console.log(`[DRY-RUN] Would update ${matchedCount} document(s) with { type: 'blog' }.`);
      console.log("[DRY-RUN] 0 documents updated.");
    } else {
      if (matchedCount === 0) {
        console.log("[INFO] All documents already have a valid type. Nothing to update.");
      } else {
        const result = await Blog.updateMany(query, {
          $set: { type: "blog" },
        });
        console.log(`[SUCCESS] Updated ${result.modifiedCount} document(s) with { type: 'blog' }.`);
      }
    }
  } catch (error) {
    console.error("[ERROR] Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("[DB] Disconnected from MongoDB.");
    console.log("==================================================");
  }
}

migrate();

