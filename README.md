# 📝 Blogify — Student Interview Experiences & Community Blogging Platform

> A full-stack web application designed to collect, structure, and explore real campus placement and internship interview experiences alongside general tech blogs — featuring **AI-assisted note structuring**, an **AI Tone Converter**, **company interview statistics**, **anonymity guarantees**, and an **editorial governance Admin Panel**.

![Node.js](https://img.shields.io/badge/Node.js-22+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-5.x-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose_8-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![EJS](https://img.shields.io/badge/EJS-Templates-B4CA65?style=for-the-badge&logo=ejs&logoColor=black)
![Groq](https://img.shields.io/badge/Groq-openai%2Fgpt--oss--120b-F55036?style=for-the-badge)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-7952B3?style=for-the-badge&logo=bootstrap&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue?style=for-the-badge)

---

## 📌 The Problem

College placement and job interview experiences are traditionally scattered across ephemeral messaging channels, informal chat groups, and fragmented personal posts. Because these posts lack a consistent structure:
- Key details (interview rounds, specific question types, difficulty levels, drive type) are often left out.
- Junior students cannot easily filter past experiences by company, role, or hiring round type.
- Aggregated company insights (typical round formats, overall difficulty trends) cannot be calculated without manual data collation.

**Blogify** addresses this challenge by providing a dedicated, structured interview experience platform alongside standard editorial blogging. Candidates can submit their hiring journeys either via a guided multi-round form or by pasting raw interview notes for AI-assisted structure extraction, with optional author anonymity to encourage candid, honest sharing.

---

## ✨ Features

### 📝 Core Blogging & Authentication
- **User Authentication**: Sign up, sign in, and logout using JWT stored in HTTP-only, `SameSite=Strict` cookies.
- **Editorial Blogs**: Regular blogging workflow with markdown/rich bodies, titles, and cover images.
- **Resilient Cover Images**: Persistent cloud storage via Cloudinary with automatic local fallback in development and safe placeholder guards.
- **Community Discussions**: Authenticated comment threads on published articles.

### 🎓 Interview Experiences
- **Structured Experience Form**: Dedicated submission flow capturing company name, role, graduation/drive year, drive type (*on-campus*, *off-campus*, *internship*), self-reported difficulty rating (1 to 5), and outcome (*selected*, *rejected*, *waiting*, *undisclosed*).
- **Multi-Round Breakdown**: Flexible multi-round logging with round types (*OA*, *coding*, *technical*, *system-design*, *behavioral*, *hr*, *other*), round descriptions, and specific question lists.
- **Anonymous Posting**: Authors can toggle complete anonymity. When enabled, the public UI strips author name, email, profile avatar, and user ID.
- **Community Reports**: Built-in reporting system allowing authenticated readers to flag inappropriate or abusive posts with a reason and optional note.
- **Directory & Filters**: Filter published experiences by company, difficulty, drive type, outcome, and verification status.

### 🏢 Company Pages & Aggregated Statistics
- **Company Directory (`/companies`)**: Searchable index of organizations with interview records.
- **Minimum Threshold for Stats**: Statistical metric cards (round breakdowns, average difficulty, outcome distributions) appear **only when 3 or more published experiences** exist for that company.
- **Sample Attribution**: Company statistics are always explicitly labelled as *"Based on N experiences"* along with a clear notice that outcomes reflect only candidates who chose to share their results.
- **Zero-Experience Safety**: Direct links to companies with zero published experiences return a friendly 404 page rather than empty or unstyled pages.

### 🤖 AI-Powered Capabilities
- **Structure My Notes**: Converts unstructured, pasted student interview notes into a draft experience populated with detected company, role, year, drive type, outcome, and round breakdowns.
- **AI Tone Converter**: On-demand draft rewriting into 5 distinct writing styles (*Professional*, *Casual*, *Social*, *Polite*, *Emojify*) powered by Groq.
- **Human-in-the-Loop Review**: AI never publishes posts automatically. Extracted fields populate form inputs for mandatory author review and manual difficulty selection before submission.

### 🛡️ Moderation & Editorial Governance
- **Central Moderation Service**: All status changes (*hide*, *publish*, *feature*, *verify*) pass through unified, audit-logged moderation workflows.
- **Report Queue (`/admin/reports`)**: Paginated moderation dashboard grouping open reports by post, displaying moderator actions with confirmation modals.
- **Verified Badge**: Moderators can mark reviewed posts with a badge displaying the exact disclaimer:
  > *"Verified: a Blogify moderator checked this experience. It is not a guarantee that every detail is correct."*
- **Owner Transparency**: When a post is hidden by moderators, the author sees a clear banner on their detail and personal listing pages (*"Hidden by moderators: [Reason]"*), while public viewers receive a standard 404.
- **Author Identity Exposure to Moderators**: Author names and emails are transparent to administrators on the moderation review page (even for anonymous posts) to facilitate accountability.

### 🏢 Company Management & Deduplication
- **Company Admin Index (`/admin/companies`)**: Directory of tracked companies with post counts, alias counts, and slug edit tools.
- **Safe Merging**: Merge duplicate companies (e.g., "Google Inc." into "Google") using atomic database operations that move all referencing experiences, preserve previous slugs as 301 redirects, migrate aliases up to a 100-alias limit, and prevent circular references.

### 👑 Platform Governance (Admin Panel)
- **Executive Dashboard (`/admin/dashboard`)**: Metric cards for users, blogs, experiences, open reports, unverified posts, and failed logins.
- **User Management (`/admin/users`)**: Search, paginate, create accounts, assign roles (`USER`/`ADMIN`), force logout sessions, unlock brute-force locked accounts, or perform safe password resets.
- **Tamper-Evident Audit Trail (`/admin/audit-log`)**: Read-only log recording every administrative mutation with actor ID, target, IP address, and timestamps.

### 🧪 Demo Data Management
- **CLI Seed & Cleanup Script (`scripts/seedDemo.js`)**: Fictional sample data generator for local demonstrations and testing, completely tag-isolated (`isDemo: true`) with zero impact on real audit or login records.

---

## 🤖 How the AI Features Work

Blogify integrates the official **Groq SDK** to run fast, deterministic inference against hosted large language models.

### Model & Configuration
- **Active Model**: `openai/gpt-oss-120b` (configured in `Settings.aiModel`).
- **Retired Model Transition Note**: Groq retired `llama-3.3-70b-versatile` for free and developer tiers in August 2026. Blogify defaults to `openai/gpt-oss-120b`, and its service layer automatically maps any stored `llama-3.3-70b-versatile` references to `openai/gpt-oss-120b` at runtime without crashing.
- **Temperature & Token Limits**: Temperature is set to `0.1` for deterministic note structuring (up to 2048 max output tokens) and `0.3` for tone conversion (up to 1024 max output tokens).
- **Inference Mode**: Note structuring requests enforce strict JSON output via Groq's `{ type: "json_object" }` response format.

### The "Structure My Notes" Workflow
1. **Client Submission**: The candidate pastes raw interview notes into the structuring panel on `/experiences/new`.
2. **Contact Redaction**: Before sending text to Groq, candidate contact info (emails, phone numbers, personal URLs) is redacted into `[REDACTED]` markers using regex heuristics.
3. **Prompt Delimiters**: Raw user notes are isolated within distinct XML/triple-backtick delimiter fences to prevent prompt injection instructions from overriding system guidelines.
4. **Structured Inference**: Groq processes the notes with a system prompt mandating JSON schema output adhering strictly to verifiable facts.
5. **Whitelist Parsing & Sanitization**: The application validates and sanitizes the returned JSON via `parseAndSanitizeStructuredOutput`:
   - Strips dangerous or unauthorized injected keys (`status`, `verified`, `anonymous`, `createdBy`, `title`, `story`).
   - Ensures string values are cleaned of control characters and trimmed.
6. **Grounding Verification Rules**:
   | Field | Grounding Rule Enforced |
   |---|---|
   | **Outcome** | Requires an exact quoted phrase from the raw notes stored in `outcomeEvidence`. If the phrase does not appear verbatim, outcome resets to `null`. |
   | **Company, Role, Year** | Must appear directly in the raw notes text; otherwise discarded. |
   | **Difficulty** | **Never filled by AI**. Left blank for mandatory manual selection by the student. |
   | **Numeric Bounds** | Round numbers and years must fall within valid bounds (e.g. 2020–current year). Out-of-range numbers are cleared, **never clamped**. |
   | **Contact Details** | Any string field containing detected contact info (phone/email/link) is automatically discarded. |
7. **Human Review**: Form fields are populated in the candidate's browser. Missing or ungrounded fields are flagged (*"AI could not find these in your notes..."*), and the candidate must manually confirm all fields before submitting.
8. **Stored Metadata**: The application logs telemetry in `AiLog` (user ID, feature, model, execution time in ms, character counts, status). **Raw student notes and prompt text are never saved to the database.**

---

## 🔒 Privacy & Security

Blogify implements defense-in-depth across the entire stack:

### Verified Security Controls
- **Helmet Security Headers**: Configured Content Security Policy (CSP) blocking unauthorized external sources and defaulting inline script protections.
- **Double-Submit CSRF Defense (`csrf-csrf`)**: Generates CSRF tokens verified on all state-changing `POST` routes via the `x-csrf-token` header or form body.
- **Multi-Tier Rate Limiting**:
  - `signinLimiter`: Restricts failed logins to 10 requests per 15 minutes per IP.
  - `adminLimiter`: Restricts administrative operations to 120 requests per minute per IP.
  - `reportLimiter`: Limits report submissions to 10 reports per hour per user/IP.
  - `aiLimiter`: Daily quotas per user (default: 10 structure requests/day, 20 tone requests/day) evaluated in Indian Standard Time (IST).
- **Brute-Force Account Lockout**: Accounts lock automatically after 5 consecutive failed attempts (`MAX_LOGIN_ATTEMPTS`) for 15 minutes (`LOCK_DURATION_MINUTES`).
- **Sanitized Login Activity**: Authentication attempts are recorded with timestamp, IP, and user-agent. **Mistyped passwords are never stored**; invalid usernames are flagged as `[invalid format]`.
- **Role Validation Against Database**: `requireAdmin` queries MongoDB directly on every request to verify `role === "ADMIN"` and `status === "active"`. The role claims in JWT cookies are never trusted on their own.
- **Instant Session Invalidation**: User records maintain a `passwordChangedAt` timestamp. Resetting passwords or forcing logouts invalidates active JWT tokens immediately.
- **Unified Public Anonymity Helper**: Public views access author details exclusively through `getPublicAuthor(blog)`. When `blog.experience.anonymous === true`, author name, email, avatar, and ID are omitted from public responses.
- **Input Sanitization & Output Escaping**: All user-generated text is HTML-escaped through EJS `<%= %>` tags, and multi-line content preserves formatting via CSS `pre-wrap-text`.

### Known Limitations
- **Contact Info Filtering**: Built-in phone, email, and URL regex filters act as an active deterrent, but cannot guarantee detection of heavily obfuscated contact details.
- **AI Extraction Accuracy**: LLM inference can produce inaccurate or incomplete interpretations; mandatory user form review is required before publishing.
- **Anonymity Boundary**: Anonymous experiences protect author identity from the public and regular members, but author identities remain visible to platform administrators in `/admin/reports/:blogId` for accountability.
- **Third-Party AI Processing**: When using AI features, redacted note excerpts are processed by the external inference provider (Groq).
- **Password Hashing**: Passwords currently use salted HMAC-SHA-256 with a server-side salt.

---

## 🏗️ Architecture

### Request Flow
```
User / Browser
   │
   ▼
[Trust Proxy] ──▶ [Helmet CSP & Security Headers]
   │
   ▼
[Cookie & Body Parsers] ──▶ [Session & Flash]
   │
   ▼
[CSRF Protection (csrf-csrf)] ──▶ [Authentication Cookie Check (JWT)]
   │
   ├── Public Routes (/experiences, /company/:slug, /blog/:id)
   │     └── Controller ──▶ Query MongoDB ──▶ Anonymity Filter (getPublicAuthor) ──▶ EJS View
   │
   ├── Protected Routes (/experiences/new, /experiences/:id/report, /ai/*)
   │     └── requireAuth / requireApiAuth ──▶ Rate Limiters ──▶ Controller / Groq SDK
   │
   └── Admin Routes (/admin/*)
         └── adminLimiter ──▶ doubleCsrfProtection ──▶ requireAdmin (DB Lookup) ──▶ Admin Views
```

### Main Database Collections

| Collection | Model File | Purpose |
|---|---|---|
| `users` | `models/user.js` | User accounts, hashed passwords, roles (`USER`/`ADMIN`), statuses, and lockout timers |
| `blogs` | `models/blog.js` | Editorial blogs and interview experiences (type, status, rounds, outcome, verification) |
| `companies` | `models/company.js` | Normalized company directory, aliases, slugs, previous slugs, and merge pointers |
| `reports` | `models/report.js` | Community reports on experiences with reason, note, status, and resolution metadata |
| `comments` | `models/comment.js` | Article discussion comments linked to blogs and user authors |
| `auditlogs` | `models/auditLog.js` | Tamper-evident admin action log recording mutations, IP addresses, and before/after states |
| `loginactivities` | `models/loginActivity.js` | Historical authentication log recording success and failure outcomes |
| `ailogs` | `models/aiLog.js` | Telemetry logs tracking AI feature usage, latency, model, and token metrics |
| `settings` | `models/settings.js` | Singleton configuration for AI models, temperature, rate limits, and prompts |

---

## 🛠️ Tech Stack

| Technology | Category | Purpose |
|---|---|---|
| **Node.js** (v22+) | Runtime | Asynchronous JavaScript runtime environment |
| **Express.js v5** | Web Framework | Request routing, security middleware, and HTTP lifecycle |
| **MongoDB + Mongoose v8**| Database & ODM | Schema validation, compound indexes, and document persistence |
| **Groq SDK** | AI Engine | Fast inference running `openai/gpt-oss-120b` |
| **Cloudinary SDK** | Cloud Storage | Persistent image storage for production blog covers |
| **EJS** | Template Engine | Server-side HTML rendering with strict output escaping |
| **Helmet v8** | Security Headers | Content Security Policy (CSP) and defense headers |
| **csrf-csrf** | CSRF Protection | Double-submit cookie CSRF mitigation |
| **express-rate-limit** | Throttling | Request rate limiting on signin, admin, report, and AI endpoints |
| **Bootstrap 5.3** | UI Framework | Responsive UI layouts, modals, tables, and navigation |
| **Font Awesome 6** | Iconography | Visual UI symbols and action indicators |
| **Chart.js** | Data Visualization | 30-day analytics charts in the admin dashboard |

---

## ⚙️ Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v22.x or above)
- [MongoDB](https://www.mongodb.com/) (Local installation or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster)
- A free [Groq API Key](https://console.groq.com/) for AI structuring and tone conversion
- A free [Cloudinary Account](https://cloudinary.com/) (Required for production deployments; optional for local development)

### Step-by-Step Setup

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
   Copy the example environment configuration:
   ```bash
   cp .env.example .env
   ```
   Open `.env` in your editor and provide valid values for your database connection (`MONGO_URL`), secrets (`JWT_SECRET`, `PASSWORD_SALT`), and your `GROQ_API_KEY`.

4. **Seed the Initial Administrator**:
   To create the first platform administrator:
   ```bash
   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=YourAdminPassword123! ADMIN_NAME="Site Admin" npm run create-admin
   ```

5. **Start the Application**:
   ```bash
   # Development mode with hot-reload
   npm run dev

   # Production mode
   npm start
   ```

6. **Access the Application**:
   - Public Website: [http://localhost:8000](http://localhost:8000)
   - Interview Experiences: [http://localhost:8000/experiences](http://localhost:8000/experiences)
   - Sign In: [http://localhost:8000/user/signin](http://localhost:8000/user/signin)
   - Admin Panel: [http://localhost:8000/admin](http://localhost:8000/admin) *(Sign in using your administrator credentials)*

7. **Optional: Seed Demo Data**:
   To populate the application with fictional sample companies, experiences, comments, and reports for demonstration:
   ```bash
   npm run seed:demo
   ```

---

## 🔑 Environment Variables

The table below lists all environment variables read by the application codebase:

| Variable | Required | Description | Example Placeholder |
|---|---|---|---|
| `PORT` | Optional | Port for the HTTP server (Default: `8000`) | `8000` |
| `NODE_ENV` | Optional | Runtime environment (`development` or `production`) | `development` |
| `MONGO_URL` | **Required** in prod | MongoDB connection URI string | `mongodb://localhost:27017/blogify` |
| `JWT_SECRET` | **Required** | Secret key for signing and verifying authentication tokens | `your_jwt_secret_key_minimum_32_characters` |
| `PASSWORD_SALT` | **Required** | Server-side salt used for HMAC-SHA-256 password hashing | `your_password_salt_string` |
| `COOKIE_SECRET` | Optional | Secret for signing HTTP cookies (falls back to `JWT_SECRET`) | `your_cookie_signing_secret_string` |
| `SESSION_SECRET` | Optional | Secret for signing session cookies (falls back to `JWT_SECRET`) | `your_session_secret_key_string` |
| `MAX_LOGIN_ATTEMPTS` | Optional | Consecutive failed logins before account lockout (Default: `5`) | `5` |
| `LOCK_DURATION_MINUTES` | Optional | Account lockout duration in minutes (Default: `15`) | `15` |
| `GROQ_API_KEY` | **Required** for AI | API key for the Groq Cloud inference service | `your_groq_api_key_here` |
| `CLOUDINARY_CLOUD_NAME` | **Required** in prod | Cloudinary cloud account name | `your_cloudinary_cloud_name` |
| `CLOUDINARY_API_KEY` | **Required** in prod | Cloudinary API access key | `your_cloudinary_api_key` |
| `CLOUDINARY_API_SECRET` | **Required** in prod | Cloudinary API access secret | `your_cloudinary_api_secret` |
| `ADMIN_EMAIL` | Optional (seed) | Administrator email for `npm run create-admin` | `admin@example.com` |
| `ADMIN_PASSWORD` | Optional (seed) | Administrator password for `npm run create-admin` | `your_admin_password_min_6_chars` |
| `ADMIN_NAME` | Optional (seed) | Administrator full name for `npm run create-admin` | `Site Admin` |

---

## 🛡️ Admin Panel

The Admin Panel (`/admin`) provides comprehensive platform control:

- **Dashboard (`/admin/dashboard`)**: Metric overview of total users, published stories, interview experiences, open reports, unverified experiences, and recent activity.
- **Moderation Queue (`/admin/reports`)**: Lists reported posts grouped by experience. Moderators can inspect reports, view author identity even on anonymous posts, and execute actions (*dismiss*, *hide*, *publish*, *feature*, *unfeature*, *verify*, *unverify*, *delete*).
- **Blog & Experience Moderation (`/admin/blogs`)**: Filter by type (*all*, *blog*, *experience*), verification status, or author. Supports bulk delete, hide, publish, and bulk verification for experiences.
- **Company Directory (`/admin/companies`)**: Rename companies, update slugs with automatic redirect creation, manage aliases, and safely merge duplicate organizations.
- **AI Governance (`/admin/ai`)**: Configure the active AI model name (`openai/gpt-oss-120b`), adjust temperature, update system prompts, set daily per-user usage limits, and inspect telemetry logs.
- **User Management (`/admin/users`)**: Search accounts, assign administrative privileges, unlock locked accounts, or perform safe password resets.
- **Audit Log (`/admin/audit-log`)**: Immutable, read-only system trail recording administrative write operations.

> **Password Security Note**: Administrators can trigger a one-time password reset for users, but **can never view existing passwords**. The temporary password is generated, hashed with salt, and displayed to the administrator exactly once.

---

## 🧪 Demo Data Management

Blogify includes a built-in demo data management script (`scripts/seedDemo.js`) to populate the platform with sample content for demonstration:

```bash
# Preview what would be created without writing to database
npm run seed:demo -- --dry-run

# Seed demo data into your development database
npm run seed:demo

# Remove all demo data and restore clean state
npm run seed:demo -- --remove

# Running on a custom database name requires explicit confirmation
node scripts/seedDemo.js --confirm-db my_custom_db
```

### Safety & Labeling Rules
- **Database Safety Guard**: Refuses execution unless the database name ends with `_dev`, `_test`, or `_demo`, unless `--confirm-db <NAME>` matches the target database name exactly.
- **Fictional Data Only**: Generates 4 fictional companies (*AcroVibe Dynamics*, *QuantumPulse Logic*, *SolarisSphere Tech*, *VerdantPeak Systems*), 2 demo users (*Demo Student*, *Demo Reader*), 15 structured experiences, comments, and reports.
- **Demo Badges**: All demo content displays clear `[Demo]` badges, and public demo pages emit `<meta name="robots" content="noindex, nofollow">` tags.
- **Inability to Sign In**: Demo accounts are assigned random runtime passwords and blocked at the login route with standard invalid credentials responses.
- **Real Company Collision Protection**: If an active company without `isDemo` already has a demo company's name or normalized key, the seeder skips that company AND all demo experiences, comments, and reports belonging to it, prints a clear message, and never attaches demo content to a real company.
- **Preservation on Remove**: If a real user creates an authentic post referencing a demo company name, running `--remove` cleans up the demo experiences while preserving the company, unsetting its `demoKey`, and setting `isDemo: false`.

---

## 📜 NPM Scripts

| Script | Command | Description |
|---|---|---|
| `start` | `node app.js` | Starts the production Express server |
| `dev` | `nodemon app.js` | Starts local development server with hot-reload |
| `migrate` | `node scripts/migrate.js` | Backfills legacy schema defaults |
| `create-admin` | `node scripts/createAdmin.js` | Creates or promotes the initial administrator account |
| `check-images` | `node scripts/checkImages.js` | Audits blog cover images for missing local files or broken URLs |
| `migrate:images` | `node scripts/migrateImages.js` | Migrates local uploads in `public/uploads` to Cloudinary |
| `migrate:experience` | `node scripts/migrateExperienceType.js` | Backfills legacy blog posts with explicit type annotations |
| `eval:structure` | `node scripts/evalStructure.js` | Runs quantitative benchmark evaluation for AI note structuring |
| `check-ai` | `node scripts/checkAi.js` | Validates Groq API connectivity and test prompt inference |
| `seed:demo` | `node scripts/seedDemo.js` | Seeds and cleans up fictional demo data (`--dry-run`, `--remove`) |

---

## 📁 Folder Structure

```
Blog-Application/
├── app.js                          # Express app configuration, security middleware, and route mounting
├── package.json                    # Project dependencies, metadata, and lifecycle scripts
├── package-lock.json               # Locked dependency version tree
├── render.yaml                     # Render infrastructure-as-code deployment specification
├── .env.example                    # Template for environment variables
├── .gitignore                      # Git ignored files and directories
│
├── data/                           # Evaluation datasets
│   ├── STRUCTURE-EVAL-README.md    # Documentation for structure evaluation dataset
│   └── structure-eval.json         # Synthetic benchmark examples marked "example": true
│
├── middlewares/                    # Express middlewares
│   ├── authentication.js           # JWT cookie parser and user context binding
│   ├── csrf.js                     # Double-submit cookie CSRF middleware (csrf-csrf)
│   └── requireAdmin.js             # Database-backed administrator role verification
│
├── models/                         # Mongoose data models
│   ├── aiLog.js                    # Telemetry log for AI tone and structure operations
│   ├── auditLog.js                 # Immutable audit trail for administrative actions
│   ├── blog.js                     # Blog & interview experience schema (rounds, outcome, status)
│   ├── comment.js                  # Article discussion comment schema
│   ├── company.js                  # Company directory schema (slugs, aliases, mergedInto)
│   ├── loginActivity.js            # Authentication history log (IP, user-agent, status)
│   ├── report.js                   # Community report schema with resolution states
│   ├── settings.js                 # Singleton settings document (AI models, prompts, limits)
│   └── user.js                     # User account schema (HMAC-SHA-256 auth, lockout, status)
│
├── routes/                         # Express route controllers
│   ├── admin.js                    # Admin router root mount
│   ├── admin/                      # Admin controllers
│   │   ├── ai.js                   # AI settings, prompts, model management, and logs
│   │   ├── auditLog.js             # Audit trail inspection
│   │   ├── blogs.js                # Editorial blog & experience moderation and bulk actions
│   │   ├── comments.js             # Discussion comment moderation
│   │   ├── companies.js            # Company management, alias editing, and deduplication
│   │   ├── dashboard.js            # Executive metrics and statistics
│   │   ├── loginActivity.js        # Authentication history viewer
│   │   ├── reports.js              # Community report queue and moderation actions
│   │   ├── settings.js             # Site-wide settings
│   │   └── users.js                # User management, role updates, and password resets
│   ├── ai.js                       # AI tone conversion and note structuring endpoints
│   ├── blog.js                     # Standard blog viewing, publishing, and comments
│   ├── company.js                  # Public company index and company detail views
│   ├── experience.js               # Interview experience browsing, submission, and reporting
│   └── user.js                     # User registration, signin, and logout
│
├── services/                       # Business logic and external integrations
│   ├── ai.js                       # Groq SDK client wrapper, structuring, and tone prompts
│   ├── anonymity.js                # Central public author resolution (getPublicAuthor)
│   ├── auditLogger.js              # Administrative write audit logging service
│   ├── authentication.js           # JWT token generation, verification, and HMAC hashing
│   ├── blogCleanup.js              # Cascading delete service for blogs, comments, and covers
│   ├── company.js                  # Company normalization, slug management, and atomic merge
│   ├── experienceInput.js          # Input sanitization, validation schemas, and contact info detection
│   ├── imageStorage.js             # Cloudinary upload, local fallback, and URL resolver
│   ├── moderation.js               # Unified status and verification transitions
│   └── settings.js                 # In-memory cached settings service
│
├── scripts/                        # Maintenance and automation scripts
│   ├── checkAi.js                  # Verifies Groq API connectivity and inference
│   ├── checkImages.js              # Audits cover images for missing files or broken URLs
│   ├── createAdmin.js              # Creates or promotes the initial administrator account
│   ├── evalStructure.js            # Quantitative evaluation benchmark for note structuring
│   ├── migrate.js                  # Schema default migration script
│   ├── migrateExperienceType.js    # Experience type annotation migration
│   ├── migrateImages.js            # Local image upload to Cloudinary migration utility
│   ├── seedDemo.js                 # Demo data seed and cleanup tool
│   └── setCover.js                 # CLI helper to assign cover images
│
├── views/                          # Server-rendered EJS templates
│   ├── addBlog.ejs                 # Standard blog authoring view
│   ├── blog.ejs                    # Blog article reader view
│   ├── error.ejs                   # Standardized error presentation view
│   ├── home.ejs                    # Public landing page with featured content
│   ├── admin/                      # Admin panel template suite
│   ├── company/                    # Company directory and profile views
│   ├── experiences/                # Interview experience browsing, detail, and form views
│   └── partials/                   # Reusable UI partials (nav, head, footer, flash)
│
└── public/                         # Public static assets (CSS, client JS, images)
    ├── css/                        # Custom stylesheets (main.css, admin.css)
    ├── Images/                     # Static icons, defaults, and placeholder SVGs
    ├── js/                         # Client JavaScript (form validation, moderation modals)
    └── uploads/                    # Local image uploads (development mode only)
```

---

## 🌐 Deployment on Render

Blogify includes an infrastructure-as-code blueprint file (`render.yaml`) optimized for deployment on [Render](https://render.com/).

### Deployment Steps
1. Push your repository to GitHub or GitLab.
2. In the Render Dashboard, navigate to **New +** &rarr; **Blueprint** and select your repository.
3. Configure the environment variables in the Render dashboard:
   - `MONGO_URL`: Your MongoDB Atlas production connection string.
   - `JWT_SECRET`: A strong, cryptographically random secret string.
   - `PASSWORD_SALT`: A unique random salt for password hashing.
   - `GROQ_API_KEY`: Your production Groq Cloud API key.
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Your Cloudinary credentials.
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD`: Credentials for your initial administrator account.
4. Deploy the service. Render will execute `npm install` and start the server using `npm start`.
5. Open the Render **Shell** tab and run the initial setup commands:
   ```bash
   # Create initial admin account
   npm run create-admin

   # Run experience type migration if upgrading from existing legacy data
   npm run migrate:experience
   ```
6. Log in to the Admin Panel at `https://<your-app>.onrender.com/admin` and verify under **AI Control** (`/admin/ai`) that the active model is set to `openai/gpt-oss-120b`.

> [!WARNING]
> **Ephemeral Disk Notice**: Render web services run on ephemeral file systems. Any image uploaded to local storage (`public/uploads`) will be lost when the container redeploys or restarts. **Always configure Cloudinary in production**. Blogify's storage service strictly refuses local disk uploads when `NODE_ENV=production` if Cloudinary credentials are missing.

> [!CAUTION]
> If seeding demo data on a live database, the script enforces a safety guard that requires passing the exact database name:
> `node scripts/seedDemo.js --confirm-db <YOUR_PRODUCTION_DB_NAME>`

---

## 📊 Evaluation: AI Note Structuring

Blogify includes an automated benchmarking tool (`npm run eval:structure`) to quantitatively assess the accuracy of AI structure extraction from raw student notes.

### Running the Evaluation
```bash
# Run benchmark against dataset
npm run eval:structure
```

### Metrics Measured
- **Field Accuracy**: Exact-match percentage for company name, job role, drive year, drive type, round count, and final hiring outcome.
- **Grounding & Hallucinations**: Verifies that extracted facts correspond to explicit statements in the source notes without fabricated details.
- **Inference Latency**: Average and percentile execution time per request in milliseconds.

The repository includes a synthetic test dataset (`data/structure-eval.json`) with sample inputs marked `"example": true`. When evaluated, the runner prints an explicit notice that synthetic example data is not reportable as benchmark results. To measure real performance, users can create a local, git-ignored dataset at `data/structure-eval.local.json` with anonymized notes.

[//]: # (TODO author: add measured results)

---

## 🔧 Troubleshooting Guide

| Symptom | Probable Cause | Recommended Fix |
|---|---|---|
| **Cannot find module from relative path** | Miscalculated directory depth when requiring files | Use verified relative paths or resolve paths relative to root (e.g. `../middlewares/requireAdmin`). |
| **`generateCsrfToken is not a function` or invalid token** | Version API mismatch in CSRF middleware | Use `generateToken` destructured from `doubleCsrf` matching `csrf-csrf` v3. |
| **Admin page unstyled / CSS 404** | Relative asset paths in nested admin templates | Reference assets using root-relative paths: `<link rel="stylesheet" href="/css/admin.css">`. |
| **`ReferenceError: <variable> is not defined` in EJS** | Controller omitted expected variable in `res.render()` | Pass safe defaults from the controller or guard with `locals.variableName`. |
| **Inline scripts or `onclick` blocked** | Helmet CSP directive `script-src-attr 'none'` active | Move client behavior to external JavaScript files in `/public/js/` loaded with `defer`. |
| **Broken cover images after redeployment** | Ephemeral container storage erased local upload | Configure Cloudinary credentials in `.env` to store images persistently in the cloud. |
| **AI returns 404 `model_not_found` or unavailable** | Target model was decommissioned or retired by provider | Visit `/admin/ai` and update `Settings.aiModel` to an active model (e.g. `openai/gpt-oss-120b`). |
| **Cannot sign in after multiple attempts** | Account locked by brute-force defense | Wait 15 minutes for lockout expiry or have an admin unlock the account from `/admin/users/:id`. |
| **`localhost:8000` shows `{"detail":"Not Found"}` or another app's page** | Another program, often a Docker container, already holds the port | Find it with `Get-NetTCPConnection -LocalPort 8000` then `Get-CimInstance Win32_Process`, stop that program or set a different `PORT`. Note that dotenv never overrides a `PORT` variable that is already set in the terminal or in Windows, and nodemon does not restart when `.env` changes. |
| **`MongooseServerSelectionError` or could not connect to Atlas** | The current IP is not on the Atlas Network Access list, the cluster is paused, or a VPN or firewall blocks port 27017 | Add the current IP in Atlas under Network Access (never remove the entry Render relies on), resume the cluster, or test with `Test-NetConnection <host> -Port 27017`. |

---

## 📸 Screenshots

*(Visual documentation screenshots are currently in preparation. To capture live screenshots, run the application locally or view the deployed service.)*

---

## 🔮 Future Improvements

- [x] 🛡️ **Comprehensive Admin Panel** — Platform governance, user management, moderation, and settings.
- [x] 🎓 **Interview Experiences Platform** — Multi-round logging, company statistics, and filtering.
- [x] 🤖 **AI-Assisted Note Structuring** — Automatic extraction of structured experience fields from raw notes.
- [x] 👤 **Author Anonymity Controls** — Public author masking enforced via central anonymity helper.
- [x] 🏢 **Company Deduplication & Merge** — Atomic company merge with alias migration and cycle detection.
- [x] 🖼️ **Persistent Cloud Image Storage** — Cloudinary integration with ephemeral disk guards.
- [x] 🔒 **Security Hardening** — Helmet CSP, double-submit CSRF, rate-limiting, and account lockout.
- [x] 🧪 **Demo Data Management** — Isolated CLI seed and cleanup tool for local demonstrations.
- [ ] 🔑 **Modern Password Hashing** — Upgrade authentication from HMAC-SHA-256 to Argon2id or bcrypt.
- [ ] 🛡️ **Two-Factor Authentication (2FA)** — TOTP-based multi-factor authentication for administrative accounts.
- [ ] 🧪 **Automated CI/CD Test Pipeline** — Continuous integration test workflow running on pull requests.
- [ ] 📧 **Email Verification & Self-Service Password Reset** — Transactional email integration for account recovery.
- [ ] ✏️ **Author Self-Service Editing for Plain Blogs** — Allow writers to edit and delete their own plain editorial blogs (currently supported for experiences).

---

## 👨‍💻 Author & License

**Rishi** — [@githubrishi321](https://github.com/githubrishi321)

This project is open-source software licensed under the **ISC License** as specified in [`LICENSE`](./LICENSE).
