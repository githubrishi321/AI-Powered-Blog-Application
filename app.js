require("dotenv").config();
const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 8000;
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const flash = require("connect-flash");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { doubleCsrf } = require("csrf-csrf");

const { checkForAuthenticationCookie } = require("./middlewares/authentication");
const { getSettings } = require("./services/settings");
const { resolveCoverUrl } = require("./services/imageStorage");

// Make resolveCoverUrl available to all EJS templates
app.locals.resolveCoverUrl = resolveCoverUrl;

// ─── DB Connection ────────────────────────────────────────────────────────────
const mongoUrl = process.env.MONGO_URL || "mongodb://localhost:27017/blogify";

if (!process.env.MONGO_URL && process.env.NODE_ENV === "production") {
  console.error("ERROR: MONGO_URL environment variable is required in production!");
  process.exit(1);
}

mongoose
  .connect(mongoUrl, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => console.log("MongoDB Connected successfully"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    if (process.env.NODE_ENV === "production") {
      console.error("Fatal: Cannot connect to MongoDB in production. Exiting...");
      process.exit(1);
    }
  });

const Blog = require("./models/blog");

// ─── View Engine ─────────────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.resolve("./views"));

// ─── Security: Helmet ────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "'unsafe-inline'", // needed for inline event handlers in existing views
        ],
        styleSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "'unsafe-inline'",
        ],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
        connectSrc: ["'self'"],
      },
    },
  })
);

// ─── Cookies & Body Parsers ──────────────────────────────────────────────────
app.use(cookieParser(process.env.COOKIE_SECRET || process.env.JWT_SECRET || "fallback-cookie-secret"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Session (for flash messages) ────────────────────────────────────────────
app.use(
  session({
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || "session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
  })
);

// ─── Flash Messages ──────────────────────────────────────────────────────────
app.use(flash());

// ─── CSRF Protection ─────────────────────────────────────────────────────────
const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.JWT_SECRET || "csrf-secret",
  cookieName: process.env.NODE_ENV === "production" ? "__Host-psifi.x-csrf-token" : "x-csrf-token",
  cookieOptions: {
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    signed: false,
    httpOnly: true,
  },
  size: 64,
  getTokenFromRequest: (req) => req.body?._csrf || req.query?._csrf || req.headers?.["x-csrf-token"],
});

// Provide CSRF token to all templates so forms can include it
app.use((req, res, next) => {
  res.locals.csrfToken = generateToken(req, res);
  next();
});

// Apply CSRF protection to admin routes (POST/PUT/DELETE/etc.)
app.use("/admin", doubleCsrfProtection);

// ─── Rate Limiting ───────────────────────────────────────────────────────────
const signinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many sign-in attempts. Please try again in 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: "Too many admin requests. Please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Auth Middleware ──────────────────────────────────────────────────────────
app.use(checkForAuthenticationCookie("token"));

// ─── Static Files & Startup Safety ──────────────────────────────────────────
const uploadsDir = path.resolve("./public/uploads");
const fs = require("fs");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(express.static(path.resolve("./public")));
app.use("/images", express.static(path.resolve("./public/Images")));

// ─── Maintenance Mode ────────────────────────────────────────────────────────
app.use(async (req, res, next) => {
  try {
    // Only check maintenance for non-admin routes
    if (req.path.startsWith("/admin") || req.path.startsWith("/user")) {
      return next();
    }
    const settings = await getSettings();
    if (settings.maintenanceMode) {
      // Admins are still allowed
      if (req.user?.role === "ADMIN") return next();
      return res.status(503).render("error", {
        user: req.user,
        message: "🔧 The site is under maintenance. Please check back soon.",
      });
    }
  } catch (e) {
    // Settings unavailable — allow through
  }
  next();
});

// ─── Public Routes ───────────────────────────────────────────────────────────
app.get("/", async (req, res) => {
  try {
    // Only show published and featured blogs on the public home page (plus legacy blogs without status field)
    const allBlogs = await Blog.find({
      $or: [
        { status: { $in: ["published", "featured"] } },
        { status: { $exists: false } },
        { status: null },
      ],
    })
      .populate("createdBy")
      .sort({ createdAt: -1 });
    res.render("home", {
      user: req.user,
      blogs: allBlogs,
    });
  } catch (error) {
    console.error("Error fetching blogs:", error);
    res.render("home", {
      user: req.user,
      blogs: [],
    });
  }
});

app.get("/test-view", (req, res) => {
  res.render("addBlog", { user: {} });
});

// ─── User Routes ─────────────────────────────────────────────────────────────
app.use("/user/signin", signinLimiter);
app.use("/user", require("./routes/user"));

// ─── Blog & AI Routes ────────────────────────────────────────────────────────
app.use("/blog", require("./routes/blog"));
app.use("/ai", require("./routes/ai"));

// ─── Admin Routes ─────────────────────────────────────────────────────────────
app.use("/admin", adminLimiter, require("./routes/admin"));

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render("error", {
    user: req.user,
    message: "Page not found",
  });
});

// ─── Error Handler ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  // CSRF errors
  if (err.code === "EBADCSRFTOKEN" || err.status === 403) {
    return res.status(403).render("error", {
      user: req.user,
      message: "Invalid or expired form token. Please go back and try again.",
    });
  }
  console.error(err.stack);
  res.status(500).render("error", {
    user: req.user,
    message: "Something went wrong!",
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`Access the application at http://localhost:${PORT}`);
  }
});
