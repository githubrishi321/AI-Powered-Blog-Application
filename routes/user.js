const { Router } = require("express");
const router = Router();
const User = require("../models/user");
const LoginActivity = require("../models/loginActivity");
const { getSettings } = require("../services/settings");
const { doubleCsrfProtection } = require("../middlewares/csrf");

// Helper to get client IP
function getClientIP(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

router.get("/signin", (req, res) => {
  return res.render("signin", { user: req.user });
});

router.get("/signup", (req, res) => {
  return res.render("signup", { user: req.user });
});

router.post("/signup", doubleCsrfProtection, async (req, res) => {
  try {
    // Check site settings for open registration
    const settings = await getSettings();
    if (!settings.registrationsOpen) {
      return res.render("signup", {
        user: req.user,
        error: "Registrations are currently closed.",
      });
    }

    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.render("signup", {
        user: req.user,
        error: "All fields are required",
      });
    }

    if (password.length < 6) {
      return res.render("signup", {
        user: req.user,
        error: "Password must be at least 6 characters long",
      });
    }

    await User.create({
      fullName,
      email,
      password,
      role: settings.defaultNewUserRole || "USER",
    });
    return res.redirect("/user/signin");
  } catch (error) {
    console.error("Signup error:", error);
    let errorMessage = "Error creating account";

    if (error.code === 11000) {
      errorMessage = "Email already exists";
    }

    return res.render("signup", {
      user: req.user,
      error: errorMessage,
    });
  }
});

router.post("/signin", doubleCsrfProtection, async (req, res) => {
  const { email, password } = req.body;
  const ip = getClientIP(req);
  const userAgent = req.headers["user-agent"] || "";

  try {
    if (!email || !password) {
      return res.render("signin", {
        user: req.user,
        error: "Email and password are required",
      });
    }

    const token = await User.matchPasswordAndGenerateToken(email, password);

    // Log successful login
    const dbUser = await User.findOne({ email }).select("_id");
    if (dbUser) {
      await LoginActivity.create({
        user: dbUser._id,
        emailAttempted: email,
        success: true,
        ip,
        userAgent,
      });
      // Update login tracking fields
      await User.findByIdAndUpdate(dbUser._id, {
        $set: { lastLoginAt: new Date(), lastLoginIP: ip },
        $inc: { loginCount: 1 },
      });
    }

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    return res.redirect("/");
  } catch (error) {
    console.error("Signin error:", error);

    // Log failed login
    try {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      await LoginActivity.create({
        emailAttempted: isEmail ? email : "[invalid format]",
        success: false,
        ip,
        userAgent,
        failReason: error.message,
      });
    } catch (logErr) {
      console.error("Failed to log login activity:", logErr.message);
    }

    return res.render("signin", {
      user: req.user,
      error: error.message.startsWith("Account locked")
        ? error.message
        : "Incorrect Email or Password",
    });
  }
});

router.get("/logout", async (req, res) => {
  // Bump tokenVersion to invalidate all existing tokens for this user
  if (req.user?._id) {
    try {
      await User.findByIdAndUpdate(req.user._id, { $inc: { tokenVersion: 1 } });
    } catch (err) {
      console.error("Error bumping tokenVersion on logout:", err.message);
    }
  }

  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  return res.redirect("/");
});

module.exports = router;
