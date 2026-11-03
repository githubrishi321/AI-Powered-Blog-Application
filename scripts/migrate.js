#!/usr/bin/env node
/**
 * scripts/migrate.js
 *
 * Safe migration script. Run with:
 *   npm run migrate
 *
 * Operations:
 * 1. Sets role = 'USER' on all users missing the role field.
 * 2. Sets status = 'active' on all users missing the status field.
 * 3. Sets tokenVersion = 0 on all users missing the tokenVersion field.
 * 4. Sets failedLoginAttempts = 0 on all users missing that field.
 * 5. Sets loginCount = 0 on all users missing that field.
 * 6. Sets blog status = 'published' on all blogs missing the status field.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017/blogify";

async function migrate() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected.\n");

  const db = mongoose.connection.db;
  const usersCol = db.collection("users");
  const blogsCol = db.collection("blogs");

  // --- Users ---
  let result;

  result = await usersCol.updateMany(
    { role: { $exists: false } },
    { $set: { role: "USER" } }
  );
  console.log(`[users] role=USER set on ${result.modifiedCount} documents.`);

  result = await usersCol.updateMany(
    { status: { $exists: false } },
    { $set: { status: "active" } }
  );
  console.log(`[users] status=active set on ${result.modifiedCount} documents.`);

  result = await usersCol.updateMany(
    { tokenVersion: { $exists: false } },
    { $set: { tokenVersion: 0 } }
  );
  console.log(`[users] tokenVersion=0 set on ${result.modifiedCount} documents.`);

  result = await usersCol.updateMany(
    { failedLoginAttempts: { $exists: false } },
    { $set: { failedLoginAttempts: 0 } }
  );
  console.log(`[users] failedLoginAttempts=0 set on ${result.modifiedCount} documents.`);

  result = await usersCol.updateMany(
    { loginCount: { $exists: false } },
    { $set: { loginCount: 0 } }
  );
  console.log(`[users] loginCount=0 set on ${result.modifiedCount} documents.`);

  // --- Blogs ---
  result = await blogsCol.updateMany(
    { status: { $exists: false } },
    { $set: { status: "published" } }
  );
  console.log(`[blogs] status=published set on ${result.modifiedCount} documents.`);

  console.log("\n✅ Migration complete.");
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

