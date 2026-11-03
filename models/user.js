const mongoose = require("mongoose");
const crypto = require("crypto");
const { createTokenForUser } = require("../services/authentication");

// Define the schema for the 'user' collection
const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    salt: {
      type: String,
    },
    password: {
      type: String,
      required: true,
    },
    profileImageURL: {
      type: String,
      default: "/Images/default.svg",
    },
    role: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
    },
    // Account status: active | suspended | banned
    status: {
      type: String,
      enum: ["active", "suspended", "banned"],
      default: "active",
    },
    // Token version — bump to invalidate all existing sessions
    tokenVersion: {
      type: Number,
      default: 0,
    },
    // Login tracking
    lastLoginAt: {
      type: Date,
    },
    loginCount: {
      type: Number,
      default: 0,
    },
    lastLoginIP: {
      type: String,
    },
    // Lockout after N failed attempts
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
  },
  { timestamps: true }
);

// hum database me password ko hash banake save kar rahe hai. jisse hacker hamare db me actual password nh dekh paaye.
userSchema.pre("save", function (next) {
  const user = this;
  if (!user.isModified("password")) {
    return next();
  }

  // Use environment variable for salt, fallback to a default for backward compatibility
  // In production, always set PASSWORD_SALT in environment variables
  const salt = process.env.PASSWORD_SALT || "secretKey";
  const hashedPassword = crypto
    .createHmac("sha256", salt)
    .update(user.password)
    .digest("hex");

  this.salt = salt;
  this.password = hashedPassword;

  next();
});

// virtual function:-
// matchPassword function
// what is schema.static syntax
// it is used to create a method in a schema that can be called on documents of that schema.
// it allows us to add custom validation logic to our documents.

userSchema.static(
  "matchPasswordAndGenerateToken",
  async function (email, password) {
    const user = await this.findOne({ email });
    if (!user) throw new Error("User not Found");

    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      throw new Error(`Account locked. Try again in ${minutesLeft} minute(s).`);
    }

    // Check account status
    if (user.status === "banned") {
      throw new Error("Your account has been banned. Please contact support.");
    }
    if (user.status === "suspended") {
      throw new Error("Your account is suspended. Please contact support.");
    }

    // signup karte waqt user ka salt and ActualHashedPassword.
    const salt = user.salt;
    const hashedPassword = user.password;

    // checking the signin Hashedpassword with user ActualHashedPassword
    const userProvidePassword = crypto
      .createHmac("sha256", salt)
      .update(password)
      .digest("hex");

    if (userProvidePassword !== hashedPassword) {
      // Increment failed attempts
      const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || "5");
      const LOCK_DURATION_MS = parseInt(process.env.LOCK_DURATION_MINUTES || "15") * 60 * 1000;

      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      throw new Error("Incorrect Password");
    }

    // Reset failed attempts on success
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    const token = createTokenForUser(user);
    return token;
  }
);

const User = mongoose.model("user", userSchema);
module.exports = User;
