# 📝 Blogify — AI-Powered Blog Application with Cloud Storage & Admin Panel

> A production-ready, full-stack blogging platform where writers can create, read, and share stories — featuring an **AI Tone Converter** powered by Groq (LLaMA 3.3), **Persistent Cloud Cover Images** via Cloudinary with local fallback, and a **Comprehensive Admin Panel** for complete platform governance.

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-5.x-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose_8-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![EJS](https://img.shields.io/badge/EJS-Templates-B4CA65?style=for-the-badge&logo=ejs&logoColor=black)
![Groq](https://img.shields.io/badge/Groq-LLaMA_3.3_70B-F55036?style=for-the-badge&logo=fastapi&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-5.x-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose_8-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![EJS](https://img.shields.io/badge/EJS-Templates-B4CA65?style=for-the-badge&logo=ejs&logoColor=black)
![Cloudinary](https://img.shields.io/badge/Cloudinary-Cloud_Storage-3448C5?style=for-the-badge&logo=cloudinary&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-LLaMA_3.3_70B-F55036?style=for-the-badge&logo=fastapi&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)

---

## 📌 Description

**Blogify** is a modern, full-stack publishing web application built on **Node.js**, **Express v5**, **MongoDB**, and **EJS**. The application empowers users to register, publish rich blog posts, upload cover images, and engage in authenticated comment discussions.

Blogify stands out through its **AI Tone Converter**, which rewrites blog drafts on demand into 5 distinct writing styles using the ultra-fast **Groq API** running `llama-3.3-70b-versatile`. 

To ensure long-term stability and security, Blogify features an enterprise-grade **Admin Panel** (`/admin`) for user management, editorial moderation, AI parameter configuration, and tamper-evident audit logging, alongside a **resilient image storage architecture** that prevents broken covers on ephemeral cloud hosting platforms like Render.

---

## ✨ Features

### 👤 Public & Writer Features
- 🔐 **User Authentication** — Secure sign up, sign in, and logout using JWT stored in HTTP-only, `SameSite=Strict` cookies.
- 📝 **Blog Publishing** — Write and share rich blog posts with titles, bodies, and cover images.
- 🖼️ **Resilient Cover Images** — Seamless cloud storage via Cloudinary with automatic local fallback in development and safe placeholder guards.
- 💬 **Interactive Comments** — Authenticated discussion threads on every blog post with author details.
- 🤖 **AI Tone Converter** *(Groq LLaMA 3.3)* — Real-time content transformation into 5 unique writing styles.
- 📱 **Responsive Design** — Fully mobile-friendly layout built with Bootstrap 5 and modern custom styling.

### 🛡️ Admin Panel (`/admin`)
- 📊 **Executive Dashboard** — Metric cards (total users, 7d/30d signups, blogs, comments, AI calls, failed logins, banned accounts) and 30-day interactive Chart.js trend graphs.
- 👥 **User Management** — Search, filter, paginate, create accounts, assign roles (`USER`/`ADMIN`), update statuses (`active`/`suspended`/`banned`), force logout sessions, and delete accounts (with cascade or author reassignment).
- 🔑 **Secure Password Resets** — Admins can reset user passwords with a secure temporary password displayed once. Passwords remain one-way HMAC-SHA256 hashes and can never be viewed by admins.
- 📰 **Blog Moderation** — Search, filter, edit title/body/author, replace or remove cover images, manage visibility status (`published`, `hidden`, `featured`), and perform bulk actions (publish, hide, delete).
- 💬 **Comment Moderation** — Search across discussions, delete individual comments, or perform bulk removals.
- 🤖 **AI Governance** — Global master toggle for AI, enable/disable specific tones, customize tone system prompts, configure model names, and set per-user daily conversion limits.
- ⚙️ **Site Settings** — Manage site name, toggle open registrations, activate maintenance mode (with admin bypass), and configure image upload size and MIME type limits.
- 🔒 **Security & Lockout** — Automated brute-force lockout after configurable failed attempts (`MAX_LOGIN_ATTEMPTS`), with admin manual unlock capabilities.
- 📋 **Authentication History** — Audit trail of login attempts logging user IDs, attempted emails, outcome status, IP addresses, user agents, and failure reasons (invalid email formats are not stored as users).
- 📜 **Immutable Audit Trail** — Tamper-evident, read-only system log recording every administrative write action with before-and-after diffs (secrets filtered).

---

## 🛡️ Admin Panel Deep Dive

The Admin Panel lives under the `/admin` prefix and provides site administrators with complete operational control.

```
/admin
├── /dashboard        # Platform metrics & 30-day analytics charts
├── /users            # User management, role changes, bans, password resets
├── /blogs            # Blog moderation, status controls, bulk actions
├── /comments         # Comment moderation & bulk deletion
├── /ai               # AI Tone Converter toggle, prompts, models, limits & logs
├── /settings         # Registration toggles, maintenance mode, upload rules
├── /login-activity   # Authentication attempt history & failure diagnostics
└── /audit-log        # Tamper-evident administrative action audit trail
```

### 📋 Feature Matrix

| Domain | Capabilities | Endpoint |
|---|---|---|
| **Dashboard** | Total users, active users, 7d/30d signups, total blogs, comments, AI calls, failed logins, banned accounts, and interactive Chart.js graphs | `GET /admin/dashboard` |
| **Users** | Search, filter by role/status, pagination, create user, edit profile, assign roles (`USER`/`ADMIN`), change status (`active`/`suspended`/`banned`), force logout, reset password (temp password shown once), manual unlock, and delete | `GET /admin/users`<br>`POST /admin/users/create`<br>`POST /admin/users/:id/edit`<br>`POST /admin/users/:id/reset-password`<br>`POST /admin/users/:id/force-logout`<br>`POST /admin/users/:id/unlock`<br>`POST /admin/users/:id/delete` |
| **Blogs** | Filter by author/status, search by title/body, edit blog details, replace/delete covers, toggle visibility (`published`/`hidden`/`featured`), delete single, bulk delete/hide/publish | `GET /admin/blogs`<br>`GET /admin/blogs/:id/edit`<br>`POST /admin/blogs/:id/edit`<br>`POST /admin/blogs/:id/delete`<br>`POST /admin/blogs/bulk` |
| **Comments** | Search comment content, filter by author, delete single comment, bulk delete comments | `GET /admin/comments`<br>`POST /admin/comments/:id/delete`<br>`POST /admin/comments/bulk` |
| **AI Governance** | Toggle AI globally, enable/disable individual tones, edit tone system prompts, configure model (`llama-3.3-70b-versatile`), set max input length, configure daily per-user limits, view AI call logs with latency | `GET /admin/ai`<br>`POST /admin/ai/save`<br>`GET /admin/ai/logs` |
| **Site Settings** | Update site name, open/close registrations, toggle maintenance mode (admins bypass), set max upload file size and allowed image types | `GET /admin/settings`<br>`POST /admin/settings/save` |
| **Login Activity** | Paginated audit log of successful and failed authentication attempts with client IP, user agent, and failure reason | `GET /admin/login-activity` |
| **Audit Log** | Immutable, read-only system log capturing administrative actions (user modifications, blog edits, deletions, settings changes) with IP and before/after diffs | `GET /admin/audit-log` |

### 🔐 How Admin Access Works
1. **Database-Checked Permissions**: Every incoming request to `/admin` passes through the `requireAdmin` middleware. The middleware queries MongoDB directly on every request to verify `role === "ADMIN"` and `status === "active"`. The role claimed in the JWT payload is never trusted on its own.
2. **Session Invalidation**: Bumping `tokenVersion` on user logout, ban, force logout, or password reset invalidates all existing JWT tokens immediately.
3. **Self-Protection Rules**: Administrators cannot delete themselves, ban themselves, or demote their own account. Furthermore, the last remaining administrator on the platform cannot be deleted or demoted.
4. **Zero-Knowledge Password Security**: User passwords are stored as one-way HMAC-SHA256 hashes with salt. Administrators cannot view existing user passwords. When an admin initiates a password reset, a secure temporary password is generated, hashed, saved, and presented **once** on the admin confirmation screen.
5. **No-Store Headers**: Admin responses automatically send `Cache-Control: no-store, no-cache, must-revalidate` to prevent sensitive admin data from being cached by web browsers or intermediate proxies.

### 👑 Creating the Initial Admin
To create or promote the first administrator safely without exposing credentials:

```bash
# Set credentials in your environment or .env
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=YourSecurePassword123!
ADMIN_NAME="Site Admin"

# Run the seeding script
npm run create-admin
```

If a user with `ADMIN_EMAIL` already exists, the script promotes them to `ADMIN`. If the user does not exist, a new administrative account is created.

---

## 📚 Application Route Reference

### Public & Author Routes
| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/` | Public | Home page listing published blog stories |
| `GET` | `/user/signup` | Public | Account registration form with live strength meter |
| `POST` | `/user/signup` | Public | Creates a new user account (checks registration toggle) |
| `GET` | `/user/signin` | Public | Login form with accessible password toggle |
| `POST` | `/user/signin` | Public (Throttled) | Authenticates credentials, logs activity & sets JWT cookie |
| `GET` | `/user/logout` | Authenticated | Clears JWT cookie, bumps `tokenVersion` & invalidates session |
| `GET` | `/blog/add-new` | Authenticated | Form to author and submit a new blog post |
| `POST` | `/blog` | Authenticated | Handles cover upload & creates blog in MongoDB |
| `GET` | `/blog/:id` | Public | Full blog article reader view and comment thread |
| `POST` | `/blog/comment/:blogId` | Authenticated | Submits a new comment on the specified article |
| `POST` | `/ai/tone` | Public (Throttled) | AI Tone Converter API endpoint powered by Groq SDK |
| `GET` | `/test-view` | Public (Debug) | Diagnostic template test view |

### Administrative Routes (`/admin`)
*(Guarded by `requireAdmin` database checks, rate limiting, and double-submit CSRF)*
| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/admin` | ADMIN | Redirects to `/admin/dashboard` |
| `GET` | `/admin/dashboard` | ADMIN | Executive metrics & 30-day interactive analytics charts |
| `GET` | `/admin/users` | ADMIN | Paginated user management table with role/status filters |
| `GET` | `/admin/users/create` | ADMIN | New user creation form |
| `POST` | `/admin/users/create` | ADMIN | Creates new user with assigned role |
| `GET` | `/admin/users/:id` | ADMIN | User detail view and activity overview |
| `GET` | `/admin/users/:id/edit` | ADMIN | User edit form |
| `POST` | `/admin/users/:id/edit` | ADMIN | Updates user profile, role, or status |
| `POST` | `/admin/users/:id/reset-password` | ADMIN | Generates one-time temporary password (shown once) |
| `POST` | `/admin/users/:id/force-logout` | ADMIN | Invalidates active user session via `tokenVersion` |
| `POST` | `/admin/users/:id/unlock` | ADMIN | Manually unlocks brute-force locked user account |
| `POST` | `/admin/users/:id/delete` | ADMIN | Deletes user (with self-deletion & last-admin protection) |
| `GET` | `/admin/blogs` | ADMIN | Content moderation list with status filters |
| `GET` | `/admin/blogs/:id/edit` | ADMIN | Blog edit form |
| `POST` | `/admin/blogs/:id/edit` | ADMIN | Updates blog title, body, author, or visibility status |
| `POST` | `/admin/blogs/:id/delete` | ADMIN | Removes blog and cleans up cover from storage |
| `POST` | `/admin/blogs/bulk` | ADMIN | Bulk publish, hide, or delete selected blogs |
| `GET` | `/admin/comments` | ADMIN | Comment moderation table |
| `POST` | `/admin/comments/:id/delete` | ADMIN | Removes individual comment |
| `POST` | `/admin/comments/bulk` | ADMIN | Bulk deletes selected comments |
| `GET` | `/admin/ai` | ADMIN | AI Tone Converter configuration interface |
| `POST` | `/admin/ai/save` | ADMIN | Updates AI model, prompts, and rate limits in DB |
| `GET` | `/admin/ai/logs` | ADMIN | AI request telemetry, character count & latency logs |
| `GET` | `/admin/settings` | ADMIN | Platform settings (registrations, maintenance mode) |
| `POST` | `/admin/settings/save` | ADMIN | Saves platform operational configuration |
| `GET` | `/admin/login-activity` | ADMIN | Authentication history and diagnostic logs |
| `GET` | `/admin/audit-log` | ADMIN | Immutable administrative write audit trail |

---

## 🔒 Security Architecture

Blogify applies defense-in-depth principles across its full stack:

- **HTTP Security Headers (Helmet v8)**: Custom Content Security Policy (CSP) allowing only sanctioned CDNs for Bootstrap and Font Awesome while defaulting `script-src-attr 'none'` to block malicious inline event handlers.
- **CSRF Defense (`csrf-csrf`)**: Double-submit cookie CSRF tokens protect all administrative mutations (`POST`, `PUT`, `DELETE`). The token is made available to all views via `res.locals.csrfToken`.
- **Brute-Force Rate Limiting (`express-rate-limit`)**:
  - `signinLimiter`: Restricts signin attempts to 10 requests per 15-minute window per IP, skipping successful logins.
  - `adminLimiter`: Restricts administrative operations to 120 requests per minute per IP.
- **Account Lockout Protection**: Automatic account lockout triggered when failed login attempts exceed `MAX_LOGIN_ATTEMPTS` (default: 5). The account is locked for `LOCK_DURATION_MINUTES` (default: 15 minutes) or until manually unlocked by an administrator.
- **Login Activity Logging**: Tracks user authentication attempts including IP address, user agent, and failure reason. Non-email strings or malformed inputs are flagged as `[invalid format]` and never created as ghost user records.
- **HTTP-Only Cookies**: JWT tokens and session cookies are configured with `httpOnly: true`, `sameSite: "strict"`, and `secure: true` in production environments.
- **Sanitized Audit Trails**: Administrative writes are recorded in `AuditLog` with before/after state diffs. All sensitive keys (passwords, salts, hashes, tokens, API keys) are filtered out prior to persistence.
- **Maintenance Mode**: When maintenance mode is enabled via Site Settings, public routes return an informative HTTP 503 page, while authenticated administrators retain access.

---

## 🖼️ Image Storage Architecture & Resilience

Blogify is designed to eliminate the class of bugs where blog covers disappear due to ephemeral cloud container disks (such as on Render free and standard tiers):

```
                   ┌────────────────────────────────────────┐
                   │ User Uploads Blog Cover (Multipart)     │
                   └───────────────────┬────────────────────┘
                                       │
                                       ▼
                   ┌────────────────────────────────────────┐
                   │ Multer Memory Storage (RAM Buffer)     │
                   └───────────────────┬────────────────────┘
                                       │
               ┌───────────────────────┴───────────────────────┐
               ▼                                               ▼
      [Production Mode]                              [Development Mode]
  Is Cloudinary Configured?                     Is Cloudinary Configured?
      ├── YES ──▶ Stream to Cloudinary              ├── YES ──▶ Stream to Cloudinary
      └── NO  ──▶ Throw Fatal Error (Reject)        └── NO  ──▶ Save to public/uploads
```

### Storage Principles
1. **Primary Cloud Storage**: Uploads use `multer.memoryStorage()`, streaming file buffers directly to **Cloudinary** and storing persistent HTTPS URLs along with `coverImagePublicId` in MongoDB.
2. **Ephemeral Disk Guard**: When running in production (`NODE_ENV=production`), uploads are strictly prohibited from silently writing to ephemeral local disks if Cloudinary is not configured.
3. **Local Development Fallback**: In development without Cloudinary credentials, uploads save to `public/uploads` with a unique timestamped, crypto-random filename.
4. **Server-Side URL Resolver (`resolveCoverUrl`)**: All views render cover URLs via `resolveCoverUrl(blog)`. If a local image file is missing on disk or invalid, it returns `/Images/blog-placeholder.svg` instead of breaking the layout.
5. **Client-Side Fallback Script (`public/js/image-fallback.js`)**: A non-inline fallback script catches runtime 404 network errors in the browser and swaps in the SVG placeholder without violating CSP.
6. **Transaction Rollback**: If a database error occurs after an image is uploaded to Cloudinary, the uploaded image is deleted immediately to prevent orphaned storage waste.

### Image Maintenance CLI Tools
- **Integrity Check**:
  ```bash
  # Check all blog images for missing local files or broken remote URLs
  npm run check-images

  # Automatically repair broken covers by resetting them to placeholder
  npm run check-images -- --fix
  ```
- **Cloudinary Migration**:
  ```bash
  # Preview migration of existing local uploads to Cloudinary
  npm run migrate:images -- --dry-run

  # Execute migration and update database records
  npm run migrate:images
  ```
- **Manual CLI Cover Assignment**:
  ```bash
  node scripts/setCover.js <blogId> <path/to/image.png>
  ```

---

## 🤖 AI Tone Converter *(Star Feature)*

Powered by the **Groq SDK** utilizing the state-of-the-art `llama-3.3-70b-versatile` model:

| Tone | Description | Default Prompt Style |
|---|---|---|
| 🏢 **Professional** | Formal, authoritative business tone | Elevates vocabulary, removes slang, structures thoughts cleanly |
| 😊 **Casual** | Friendly, relaxed, conversational | Writes like a friendly chat, simple words, warm cadence |
| 📱 **Social** | Punchy, shareable, attention-grabbing | Short sentences, high engagement, adds contextual hashtags |
| 🙏 **Polite** | Courteous, respectful, thoughtful | Considerate phrasing, warm expressions, respectful tone |
| 😄 **Emojify** | Expressive and colorful | Naturally enriches text with relevant emojis while maintaining meaning |
| 📄 **Original** | Unmodified text | Returns the original draft without alteration |

### Dynamic Database Governance
Unlike static implementations, Blogify's AI Tone Converter is dynamically managed via the Admin Panel:
- **Master Switch**: Enable or disable the entire AI service with a single click.
- **Per-Tone Control**: Enable/disable specific tones or write custom system prompts in `Settings.aiTones`.
- **Model Flexibility**: Change the underlying Groq model ID in `Settings.aiModel` without redeploying code.
- **Usage Limits**: Enforce maximum input lengths (`aiMaxInputLength`, default 5,000 chars) and per-user daily conversion limits (`aiDailyUserLimit`).
- **Telemetry**: Every conversion logs user ID, tone, character length, execution latency (in ms), and status to `AiLog`.

---

## 🛠️ Tech Stack

| Technology | Category | Purpose |
|---|---|---|
| **Node.js** (v20+) | Runtime | High-performance asynchronous JavaScript backend |
| **Express.js v5** | Web Framework | Routing, middleware chaining, and HTTP request lifecycle |
| **MongoDB + Mongoose v8** | Database & ODM | Schema-based document storage, indexes, and validation |
| **Cloudinary SDK** | Cloud Storage | Persistent, resilient blog cover image hosting |
| **EJS** | View Engine | Server-rendered dynamic HTML templates |
| **Groq SDK** | AI Engine | Sub-second AI inference running LLaMA 3.3 70B |
| **Helmet v8** | Security | HTTP response security headers and Content Security Policy |
| **csrf-csrf** | Security | Double-submit cookie CSRF mitigation |
| **express-rate-limit** | Security | Brute-force throttling for authentication and admin routes |
| **express-validator** | Security | Request input validation and sanitization |
| **Multer v2** | File Uploads | Memory-buffered multipart form parsing |
| **JSON Web Tokens (JWT)** | Authentication | Secure cookie authentication with `tokenVersion` invalidation |
| **Node.js Crypto** | Security | Salted HMAC-SHA256 password hashing |
| **Bootstrap 5.3** | UI Framework | Responsive grids, navigation, modals, and utilities |
| **Font Awesome 6** | Icons | Vector UI icons for navigation and actions |
| **Chart.js** | Data Visualization | Interactive 30-day dashboard trend analytics |
| **Render** | Cloud Hosting | Production deployment via `render.yaml` specification |

---

## 📸 Screenshots

| Page | Description | Preview |
|---|---|---|
| **Home Page** | Feed displaying published blogs with covers and stats | `![Home Page](./public/screenshots/home.png)` *(Placeholder)* |
| **Blog Detail & AI Converter** | Reader view with interactive AI Tone Converter buttons | `![Blog Detail](./public/screenshots/blog-detail.png)` *(Placeholder)* |
| **Create Blog** | Authoring interface with live image picker and tone preview | `![Create Blog](./public/screenshots/add-blog.png)` *(Placeholder)* |
| **Admin Dashboard** | Executive metrics, recent activity feeds, and 30-day graphs | `![Admin Dashboard](./public/screenshots/admin-dashboard.png)` *(Placeholder)* |
| **Admin User Manager** | User table with search, role filters, status badges, and actions | `![Admin Users](./public/screenshots/admin-users.png)` *(Placeholder)* |
| **Admin Audit Log** | Tamper-evident administrative action log with diff summaries | `![Admin Audit Log](./public/screenshots/admin-audit-log.png)` *(Placeholder)* |

> ℹ️ *Note: The screenshot paths above are placeholder references for your repository documentation.*

---

## 🔑 Environment Variables

The application reads the following environment variables. None are hardcoded, and secrets should never be committed to source control.

| Variable | Required | Description | Example Placeholder |
|---|---|---|---|
| `PORT` | Optional | Port for the HTTP server to listen on (Default: `8000`) | `8000` |
| `NODE_ENV` | Optional | Application runtime mode (`development` or `production`) | `development` |
| `MONGO_URL` | **Required** in prod | MongoDB connection string URI (local or Atlas) | `mongodb://localhost:27017/blogify` |
| `JWT_SECRET` | **Required** | Secret key for signing and verifying JWT authentication cookies | `your_jwt_secret_key_minimum_32_characters` |
| `PASSWORD_SALT` | Recommended | Salt string for HMAC-SHA256 password hashing (Default: `secretKey`) | `your_secure_password_salt_string` |
| `COOKIE_SECRET` | Optional | Secret for signing HTTP cookies (falls back to `JWT_SECRET`) | `your_cookie_signing_secret_string` |
| `SESSION_SECRET` | Optional | Secret for signing session cookies (falls back to `JWT_SECRET`) | `your_session_secret_key_string` |
| `MAX_LOGIN_ATTEMPTS` | Optional | Number of consecutive failed logins before account lockout (Default: `5`) | `5` |
| `LOCK_DURATION_MINUTES` | Optional | Duration in minutes an account remains locked (Default: `15`) | `15` |
| `GROQ_API_KEY` | **Required** for AI | API key for the Groq Cloud SDK inference service | `your_groq_api_key_here` |
| `CLOUDINARY_CLOUD_NAME` | **Required** in prod | Cloudinary cloud name for persistent image hosting | `your_cloudinary_cloud_name` |
| `CLOUDINARY_API_KEY` | **Required** in prod | Cloudinary API access key | `your_cloudinary_api_key` |
| `CLOUDINARY_API_SECRET` | **Required** in prod | Cloudinary API access secret | `your_cloudinary_api_secret` |
| `ADMIN_EMAIL` | **Required** for seed | Email address used by `npm run create-admin` | `admin@example.com` |
| `ADMIN_PASSWORD` | **Required** for seed | Password used by `npm run create-admin` (min 6 characters) | `your_secure_admin_password_min_6_chars` |
| `ADMIN_NAME` | Optional for seed | Full name used by `npm run create-admin` (Default: `Admin`) | `Site Admin` |

---

## 📝 NPM Scripts

All scripts configured in `package.json`:

| Script | Command | Description |
|---|---|---|
| `start` | `node app.js` | Starts the production Express server on the configured `PORT` |
| `dev` | `nodemon app.js` | Starts the local development server with hot-reloading on file edits |
| `migrate` | `node scripts/migrate.js` | Safely backfills missing schema fields (`role`, `status`, `tokenVersion`) on existing documents |
| `create-admin` | `node scripts/createAdmin.js` | Seeds or promotes the initial administrator account from environment variables |
| `check-images` | `node scripts/checkImages.js` | Checks all blog covers for missing local files or broken URLs (supports `-- --fix`) |
| `migrate:images`| `node scripts/migrateImages.js` | Migrates local blog cover images to Cloudinary storage (supports `-- --dry-run`) |

---

## 📁 Folder Structure

```
Blog-Application/
├── app.js                          # Express application setup, security & middleware
├── package.json                    # Dependencies, metadata & lifecycle scripts
├── package-lock.json               # Locked dependency tree
├── render.yaml                     # Render infrastructure-as-code deployment blueprint
├── .env.example                    # Documented template for environment variables
├── .gitignore                      # Git ignored files & patterns
│
├── models/                         # Mongoose data schemas & validation
│   ├── user.js                     # User schema (auth, HMAC-SHA256 hashing, lockout)
│   ├── blog.js                     # Blog schema (content, coverImagePublicId, status)
│   ├── comment.js                  # Discussion comment schema
│   ├── settings.js                 # Site settings singleton (AI, limits, maintenance)
│   ├── aiLog.js                    # Telemetry log for AI tone conversions
│   ├── loginActivity.js            # Audit log for authentication attempts
│   └── auditLog.js                 # Immutable audit log for administrative actions
│
├── routes/                         # Express controllers & routing
│   ├── user.js                     # Public auth routes (signup, signin, logout)
│   ├── blog.js                     # Blog viewing, publishing & commenting
│   ├── ai.js                       # AI tone conversion API endpoint
│   ├── admin.js                    # Admin router mount & requireAdmin guard
│   └── admin/                      # Modular admin controllers
│       ├── dashboard.js            # Dashboard metrics & 30-day analytics charts
│       ├── users.js                # User CRUD, role changes, bans, password resets
│       ├── blogs.js                # Blog moderation, status toggles & bulk actions
│       ├── comments.js             # Comment moderation & bulk removals
│       ├── ai.js                   # AI settings, custom prompts & conversion logs
│       ├── settings.js             # Site-wide settings (maintenance, registrations)
│       ├── loginActivity.js        # Authentication history viewer
│       └── auditLog.js             # System audit trail viewer
│
├── middlewares/                    # Custom Express middlewares
│   ├── authentication.js           # JWT cookie parsing & user context binding
│   └── requireAdmin.js             # Admin role database check & no-store headers
│
├── services/                       # Business logic & external API integrations
│   ├── authentication.js           # JWT signing and verification service
│   ├── imageStorage.js             # Cloudinary upload, local fallback & URL resolver
│   ├── ai.js                       # Groq SDK client & tone prompt converter
│   ├── settings.js                 # In-memory cached site settings service
│   └── auditLogger.js              # Sanitized administrative action logger
│
├── scripts/                        # Maintenance & CLI automation scripts
│   ├── createAdmin.js              # Initial administrator seeding script
│   ├── migrate.js                  # Safe database schema migration script
│   ├── checkImages.js              # Image health check & integrity repair tool
│   ├── migrateImages.js            # Local image to Cloudinary migration utility
│   └── setCover.js                 # CLI utility to attach/recover a blog cover image
│
├── views/                          # Server-rendered EJS templates
│   ├── home.ejs                    # Public home page with story feed
│   ├── blog.ejs                    # Blog detail view with AI tone converter UI
│   ├── addBlog.ejs                 # Blog creation form with tone selector
│   ├── signin.ejs                  # Sign in page with accessible password toggle
│   ├── signup.ejs                  # Sign up page with password strength bar
│   ├── error.ejs                   # Standardized error presentation view
│   ├── partials/                   # Reusable site partials
│   │   ├── head.ejs                # HTML head, stylesheets & meta tags
│   │   ├── nav.ejs                 # Global navigation bar with user dropdown
│   │   ├── footer.ejs              # Global footer component
│   │   └── scripts.ejs             # Global JavaScript bundles
│   └── admin/                      # Admin Panel views
│       ├── layout.ejs              # Admin base layout wrapper
│       ├── dashboard.ejs           # Admin analytics dashboard
│       ├── partials/               # Admin sidebar, topbar, styles, flash
│       ├── users/                  # User list, create, edit, and detail views
│       ├── blogs/                  # Blog list and edit views
│       ├── comments/               # Comment management list view
│       ├── ai/                     # AI settings control & telemetry logs
│       ├── settings/               # Platform settings configuration view
│       ├── loginActivity/          # Authentication activity audit view
│       └── auditLog/               # Administrative audit trail view
│
└── public/                         # Public static assets
    ├── css/                        # CSS stylesheets
    │   ├── main.css                # Global styles, navbar stacking & form fields
    │   └── admin.css               # Admin panel styling & components
    ├── js/                         # Client-side JavaScript
    │   ├── admin.js                # Admin charts, search filters, bulk actions
    │   ├── image-fallback.js       # CSP-compliant broken image fallback handler
    │   ├── password-toggle.js      # Accessible show/hide password toggle logic
    │   └── signup.js               # Dynamic password strength meter
    ├── Images/                     # Static icons, defaults & placeholder
    │   ├── blog-placeholder.svg    # Resilient cover image fallback placeholder
    │   ├── fevicon.png             # Application favicon
    │   ├── default.png             # Default user avatar PNG
    │   └── default.svg             # Default user avatar SVG
    └── uploads/                    # Local image uploads (development fallback)
```

---

## ⚙️ Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v20.x or above recommended)
- [MongoDB](https://www.mongodb.com/) (Local server or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster)
- A free [Groq API Key](https://console.groq.com/) for the AI Tone Converter
- A free [Cloudinary Account](https://cloudinary.com/) (Required for production deployments; optional for local development)

### Step-by-Step Instructions

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/githubrishi321/Blog-Application.git
   cd Blog-Application
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and configure your credentials. At minimum for local development:
   - `JWT_SECRET`: A secure random string.
   - `GROQ_API_KEY`: Your Groq Cloud API key.
   - `ADMIN_EMAIL` & `ADMIN_PASSWORD`: Credentials for your initial administrator account.

4. **Run Database Migrations**:
   Backfill schema defaults across existing documents:
   ```bash
   npm run migrate
   ```

5. **Seed the Initial Administrator**:
   ```bash
   npm run create-admin
   ```

6. **Start the Development Server**:
   ```bash
   npm run dev
   ```

7. **Explore the Application**:
   - Public Website: [http://localhost:8000](http://localhost:8000)
   - Sign In: [http://localhost:8000/user/signin](http://localhost:8000/user/signin)
   - Admin Panel: [http://localhost:8000/admin](http://localhost:8000/admin) *(Log in using your `ADMIN_EMAIL` and `ADMIN_PASSWORD`)*

---

## 🚀 Usage Guide

### For Authors and Readers
1. **Create an Account**: Visit `/user/signup` to register. Type a password to view the dynamic password strength meter.
2. **Publish a Blog**: Navigate to **Add Blog** (`/blog/add-new`). Enter a title, write your story, and attach a cover image.
3. **Transform with AI**: While writing or viewing your blog, select one of the AI tone options (**Professional**, **Casual**, **Social**, **Polite**, **Emojify**) and click **Apply** to instantly rewrite the content.
4. **Engage with Comments**: Open any blog to read the story and participate in discussion threads.

### For Site Administrators
1. **Access Governance**: Log in with your admin account and click **Admin Panel** in the user dropdown or navigate to `/admin`.
2. **Review Analytics**: Monitor real-time metrics, signup trends, and AI consumption on `/admin/dashboard`.
3. **Moderate Content**: Navigate to `/admin/blogs` or `/admin/comments` to feature high-quality posts, hide spam, or perform bulk removals.
4. **Manage Accounts**: View `/admin/users` to suspend abusive users, reset forgotten passwords with one-time temporary keys, or unlock accounts locked by brute-force defenses.
5. **Tune AI & Platform Rules**: Visit `/admin/ai` to customize tone prompts or adjust daily limits, and visit `/admin/settings` to toggle open registration or enable maintenance mode.

---

## 🌐 Deployment on Render

Blogify includes an infrastructure-as-code blueprint file (`render.yaml`) optimized for deployment on [Render](https://render.com/).

### Method 1: Blueprint Deployment (Recommended)
1. Push your repository to GitHub or GitLab.
2. In the Render Dashboard, click **New +** &rarr; **Blueprint**.
3. Select your repository. Render will automatically parse `render.yaml`.
4. Fill in the required secret environment variables prompted by the dashboard.
5. Click **Apply**.

### Method 2: Manual Web Service Setup
If creating the service manually:
- **Environment**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: `Free` or `Starter`

### Required Environment Variables on Render
Configure these in the Render service **Environment** tab:

```env
NODE_VERSION=20
NODE_ENV=production
MONGO_URL=mongodb+srv://<username>:<password>@cluster.mongodb.net/blogify?retryWrites=true&w=majority
JWT_SECRET=your_super_strong_production_jwt_secret_key
PASSWORD_SALT=your_super_strong_production_password_salt
GROQ_API_KEY=gsk_your_groq_api_key
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=YourAdminProductionPassword123!
ADMIN_NAME=Platform Administrator
SESSION_SECRET=your_strong_session_secret
MAX_LOGIN_ATTEMPTS=5
LOCK_DURATION_MINUTES=15
```

### ⚠️ Ephemeral Disk Warning
> [!WARNING]
> Render web services utilize **ephemeral file systems**. Any file saved to the local disk (`public/uploads`) will be **erased** whenever Render redeploys or restarts your service.
> 
> To guarantee that uploaded blog covers are never lost, **always configure Cloudinary** (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) in production. Blogify's storage service strictly rejects writing to local disk when `NODE_ENV=production` if Cloudinary is omitted.

### Seeding Admin in Production
After your initial Render deployment completes:
1. Open the **Shell** tab in your Render service dashboard.
2. Run:
   ```bash
   npm run create-admin
   ```
3. Your admin account is now active and ready for login.

---

## 🔧 Troubleshooting Guide

Solutions to real issues encountered during development and deployment:

### 1. `Cannot find module '../../middlewares/requireAdmin'`
- **Cause**: Incorrect relative path depth. Routes in `routes/admin.js` are only one directory deep, so requiring from the middlewares folder needs `../middlewares/` instead of `../../middlewares/`.
- **Fix**: Ensure requires in route files use `../middlewares/requireAdmin` or `../models/user`.

### 2. `TypeError: generateCsrfToken is not a function` or Invalid CSRF Token
- **Cause**: Version mismatch between `csrf-csrf` v3 and v4. v3 exports `generateToken` while v4 exports `generateCsrfToken`.
- **Fix**: Destructure `{ generateToken, doubleCsrfProtection } = doubleCsrf(...)` in `app.js` matching `csrf-csrf` v3.

### 3. Admin Page Unstyled or CSS 404
- **Cause**: Using relative paths like `href="css/admin.css"` or `href="../../css/admin.css"` breaks when viewing nested routes like `/admin/users/123/edit`.
- **Fix**: Always reference assets using root-relative absolute paths: `<link rel="stylesheet" href="/css/admin.css">` and `<link rel="stylesheet" href="/css/main.css">`.

### 4. `ReferenceError: <variable> is not defined` in EJS
- **Cause**: Template references a variable that the controller did not pass to `res.render(...)` (e.g. `passwordReset`, `tempPassword`).
- **Fix**: Ensure controllers pass safe defaults (e.g. `passwordReset: false, tempPassword: null`), or guard the template using `locals.variableName`.

### 5. Eye Toggle Button Dead or Inline Scripts Blocked
- **Cause**: Helmet v8 sets the Content Security Policy directive `script-src-attr 'none'` by default, blocking inline `onclick="..."` attributes and inline script tags.
- **Fix**: Load behavior unobtrusively using external scripts loaded with `defer` (e.g. `<script src="/js/password-toggle.js" defer></script>`).

### 6. Broken Blog Cover Images After Redeployment
- **Cause**: Images stored locally on ephemeral storage get wiped during container restarts.
- **Fix**: Configure Cloudinary credentials in `.env`, run `npm run migrate:images` to migrate local assets, and rely on `resolveCoverUrl` to display `/Images/blog-placeholder.svg` if any file is missing.

### 7. Account Locked After Multiple Failed Logins
- **Cause**: Repeated invalid password attempts triggered brute-force defense (`failedLoginAttempts >= MAX_LOGIN_ATTEMPTS`).
- **Fix**: Wait for the lockout period to expire (`LOCK_DURATION_MINUTES`), or have an administrator unlock the account instantly from `/admin/users/:id` by clicking **Unlock Account**.

---

## 🔮 Future Improvements

- [x] 🛡️ **Comprehensive Admin Panel** — Complete site governance, analytics, moderation, and settings.
- [x] 🖼️ **Persistent Cloud Image Storage** — Cloudinary integration with local development fallback.
- [x] 🤖 **Dynamic AI Tone Governance** — Custom tone prompts, model configuration, and usage limits in DB.
- [x] 🔒 **Security Hardening** — Helmet CSP, double-submit CSRF, rate-limiting, and brute-force lockout.
- [x] 🛠️ **CLI Maintenance Tools** — Scripts for image integrity verification, repair, and migration.
- [ ] 📊 **Author Dashboard** — Dedicated personal dashboard for regular writers to review their own stories.
- [ ] ✏️ **Author Self-Service Editing** — Allow writers to edit and delete their own published blogs.
- [ ] 👍 **Likes & Bookmarks** — Community reactions and personal bookmark collections.
- [ ] 🔍 **Public Search & Tag Filtering** — Public full-text search and category tags.
- [ ] 🌙 **Dark Mode** — User preference theme toggle between light and dark palettes.
- [ ] 📎 **WYSIWYG Rich Text Editor** — Upgrade from standard text areas to a rich editor (Markdown or Quill).
- [ ] 🔑 **Modern Password Hashing** — Upgrade password hashing from HMAC-SHA256 to Argon2id or bcrypt.
- [ ] 🛡️ **Two-Factor Authentication (2FA)** — TOTP-based multi-factor authentication for administrative accounts.
- [ ] 📧 **Email Verification & Password Reset** — Integration with transactional email (SendGrid/Resend) for self-service password recovery.

---

## 👨‍💻 Author

**Rishi** — [@githubrishi321](https://github.com/githubrishi321)

[![GitHub](https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/githubrishi321)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/rishikesh-c-rpc/)

---

## 📄 License

This project is open source and available under the [ISC License](./package.json).
