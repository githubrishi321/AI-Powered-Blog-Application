#!/usr/bin/env node
/**
 * scripts/createAdmin.js
 *
 * Creates or promotes the first admin user.
 * Reads credentials from environment variables:
 *   ADMIN_EMAIL    - email address of the admin
 *   ADMIN_PASSWORD - password (must be at least 6 characters)
 *   ADMIN_NAME     - full name (optional, defaults to "Admin")
 *
 * Run with:
 *   npm run create-admin
 *
 * If a user with ADMIN_EMAIL already exists, they are promoted to ADMIN.
 * If they do not exist, a new ADMIN account is created.
 *
 * SECURITY: No credentials are hardcoded. Never commit .env to source control.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017/blogify";

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_NAME || "Admin";

  if (!email || !password) {
    console.error(
      "ERROR: ADMIN_EMAIL and ADMIN_PASSWORD must be set in environment variables."
    );
    process.exit(1);
  }

  if (password.length < 6) {
    console.error("ERROR: ADMIN_PASSWORD must be at least 6 characters.");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected.\n");

  // Import the User model AFTER connecting (it requires the connection)
  const User = require("../models/user");

  const existing = await User.findOne({ email });

  if (existing) {
    existing.role = "ADMIN";
    existing.status = "active";
    existing.password = password; // triggers pre('save') HMAC SHA-256 hook
    await existing.save();
    console.log(`✅ Existing user ${email} promoted/updated to ADMIN with configured password.`);
  } else {
    const admin = await User.create({
      fullName,
      email,
      password, // will be hashed by the pre-save hook
      role: "ADMIN",
      status: "active",
    });
    console.log(`✅ Admin account created: ${admin.email} (${admin.fullName})`);
  }

  await mongoose.disconnect();
  console.log("Done.");
}

createAdmin().catch((err) => {
  console.error("createAdmin failed:", err);
  process.exit(1);
});

