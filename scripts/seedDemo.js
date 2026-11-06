/**
 * Demo Data Seed Script
 * Fills a fresh development/test database with clearly labelled demo content
 * and removes it cleanly afterwards.
 *
 * Usage:
 *   npm run seed:demo
 *   npm run seed:demo -- --dry-run
 *   npm run seed:demo -- --remove
 *   npm run seed:demo -- --confirm-db <dbname>
 */

const mongoose = require("mongoose");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Blog = require("../models/blog");
const Company = require("../models/company");
const User = require("../models/user");
const Comment = require("../models/comment");
const Report = require("../models/report");
const { deleteBlogsCascade } = require("../services/blogCleanup");
const { parseAndValidateExperiencePayload, findContactInfo } = require("../services/experienceInput");

/**
 * Pure safety check for database names.
 * Refuses unless dbName ends with _dev, _test, or _demo,
 * OR confirmDbArg equals the database name exactly.
 *
 * @param {string} dbName
 * @param {string} [confirmDbArg]
 * @returns {boolean}
 */
function isDatabaseSafe(dbName, confirmDbArg) {
  if (!dbName || typeof dbName !== "string") return false;
  if (dbName.endsWith("_dev") || dbName.endsWith("_test") || dbName.endsWith("_demo")) {
    return true;
  }
  if (confirmDbArg && typeof confirmDbArg === "string" && confirmDbArg === dbName) {
    return true;
  }
  return false;
}

/**
 * Extracts database name from MongoDB connection string.
 * @param {string} uri
 * @returns {string}
 */
function extractDatabaseName(uri) {
  if (!uri) return "";
  try {
    const url = new URL(uri.replace("mongodb://", "http://").replace("mongodb+srv://", "http://"));
    const pathname = url.pathname.replace(/^\//, "");
    return pathname.split("?")[0] || "";
  } catch (e) {
    const match = uri.match(/\/([^/?]+)(\?|$)/);
    return match ? match[1] : "";
  }
}

/**
 * Masks credentials in a MongoDB connection URI for safe console logging.
 * @param {string} uri
 * @returns {string}
 */
function maskUriCredentials(uri) {
  if (!uri) return "";
  return uri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
}

// ─── Fictional Companies (Invented & Fictional) ──────────────────────────────
const DEMO_COMPANIES = [
  {
    name: "AcroVibe Dynamics",
    slug: "acrovibe-dynamics",
    normalizedKey: "acrovibe dynamics",
    aliases: ["AcroVibe", "AVD Tech"],
    demoKey: "demo-company-acrovibe",
  },
  {
    name: "QuantumPulse Logic",
    slug: "quantumpulse-logic",
    normalizedKey: "quantumpulse logic",
    aliases: ["QuantumPulse", "QPL Systems"],
    demoKey: "demo-company-quantumpulse",
  },
  {
    name: "SolarisSphere Tech",
    slug: "solarissphere-tech",
    normalizedKey: "solarissphere tech",
    aliases: ["SolarisSphere", "SST Solutions"],
    demoKey: "demo-company-solarissphere",
  },
  {
    name: "VerdantPeak Systems",
    slug: "verdantpeak-systems",
    normalizedKey: "verdantpeak systems",
    aliases: ["VerdantPeak", "VPS Software"],
    demoKey: "demo-company-verdantpeak",
  },
];

// ─── 15 Demo Experience Raw Definitions ──────────────────────────────────────
const DEMO_EXPERIENCES_DATA = [
  // 6 experiences for Company 0 (AcroVibe Dynamics)
  {
    companyIndex: 0,
    role: "Junior Platform Engineer",
    year: "2024",
    driveType: "on-campus",
    difficulty: 4,
    outcome: "selected",
    verified: true,
    anonymous: false,
    rounds: [
      {
        roundNumber: 1,
        name: "Online Assessment",
        type: "aptitude",
        description: "General quantitative aptitude and logical reasoning questions.",
        questions: ["Number series and permutation basics", "Data interpretation charts", "Work and time calculations"],
      },
      {
        roundNumber: 2,
        name: "Technical Coding",
        type: "coding",
        description: "Data structures and algorithm implementation.",
        questions: ["Balanced binary tree traversal", "Two-pointer array partition", "LRU cache concept and simulation"],
      },
      {
        roundNumber: 3,
        name: "Systems & HR",
        type: "hr",
        description: "Behavioral and team communication fit questions.",
        questions: ["Why choose cloud infrastructure", "Describe a technical disagreement during a project"],
      },
    ],
    tips: "Practice core data structures and review fundamental OS process scheduling.",
    story: "The overall campus placement process spanned two days. The interviewers focused on clarity of thought and problem decomposition.",
  },
  {
    companyIndex: 0,
    role: "Full Stack Developer",
    year: "2024",
    driveType: "off-campus",
    difficulty: 3,
    outcome: "selected",
    verified: false,
    anonymous: true,
    rounds: [
      {
        roundNumber: 1,
        name: "Coding Round",
        type: "coding",
        description: "Practical web component implementation and array algorithms.",
        questions: ["Subarray sum equals target", "Throttle and debounce function design"],
      },
      {
        roundNumber: 2,
        name: "Technical Architecture",
        type: "technical",
        description: "Database indexing and REST API design.",
        questions: ["REST vs GraphQL tradeoffs", "Database query optimization strategies"],
      },
    ],
    tips: "Focus on clean coding principles and clear modular separation.",
  },
  {
    companyIndex: 0,
    role: "DevOps Associate",
    year: "2023",
    driveType: "internship",
    difficulty: 3,
    outcome: "rejected",
    verified: false,
    anonymous: false,
    rounds: [
      {
        roundNumber: 1,
        name: "Scripting Round",
        type: "coding",
        description: "File processing and automation scripts.",
        questions: ["Log parsing with regular expressions", "Automated deployment pipeline design"],
      },
      {
        roundNumber: 2,
        name: "Linux Fundamentals",
        type: "technical",
        description: "Operating system internals and networking.",
        questions: ["Process states and signals", "TCP handshake mechanics"],
      },
    ],
    tips: "Review Linux command line tools and container lifecycle.",
  },
  {
    companyIndex: 0,
    role: "Quality Assurance Specialist",
    year: "2025",
    driveType: "on-campus",
    difficulty: 2,
    outcome: "waiting",
    verified: false,
    anonymous: false,
    rounds: [
      {
        roundNumber: 1,
        name: "Aptitude & Logic",
        type: "aptitude",
        description: "Logical deduction and test case identification.",
        questions: ["Edge case boundary value analysis", "Logic puzzle deduction"],
      },
      {
        roundNumber: 2,
        name: "Automation Interview",
        type: "technical",
        description: "Testing frameworks and test automation scripts.",
        questions: ["End to end test suite structuring", "Handling flaky network requests"],
      },
    ],
    tips: "Understand boundary value analysis and exploratory testing techniques.",
  },
  {
    companyIndex: 0,
    role: "Backend Intern",
    year: "2025",
    driveType: "on-campus",
    difficulty: 5,
    outcome: "undisclosed",
    verified: false,
    anonymous: true,
    rounds: [
      {
        roundNumber: 1,
        name: "Algorithm Sprint",
        type: "coding",
        description: "Dynamic programming and graph traversals.",
        questions: ["Shortest path in weighted DAG", "Longest increasing subsequence", "Trie prefix searching"],
      },
      {
        roundNumber: 2,
        name: "System Engineering",
        type: "technical",
        description: "High concurrency and caching strategies.",
        questions: ["Cache invalidation tradeoffs", "Distributed locks implementation"],
      },
    ],
    tips: "Prepare thoroughly for dynamic programming and graph algorithms.",
  },
  {
    companyIndex: 0,
    role: "Data Analyst",
    year: "2024",
    driveType: "off-campus",
    difficulty: 3,
    outcome: "selected",
    verified: false,
    anonymous: false,
    rounds: [
      {
        roundNumber: 1,
        name: "SQL & Analytics",
        type: "technical",
        description: "Complex aggregations and window functions.",
        questions: ["Window functions ranking queries", "Pivot table generation with SQL", "Handling missing time series data"],
      },
      {
        roundNumber: 2,
        name: "Behavioral Round",
        type: "hr",
        description: "Stakeholder presentation and communication skills.",
        questions: ["Explaining metrics to non-technical stakeholders", "Prioritizing conflicting analysis requests"],
      },
    ],
    tips: "Master SQL window functions and CTEs.",
  },

  // 4 experiences for Company 1 (QuantumPulse Logic)
  {
    companyIndex: 1,
    role: "Embedded Systems Engineer",
    year: "2024",
    driveType: "on-campus",
    difficulty: 4,
    outcome: "selected",
    verified: true,
    anonymous: false,
    rounds: [
      {
        roundNumber: 1,
        name: "Hardware & C Basics",
        type: "technical",
        description: "Microcontroller architecture and bitwise manipulation.",
        questions: ["Bitwise register masking", "Interrupt service routine best practices", "Memory alignment rules"],
      },
      {
        roundNumber: 2,
        name: "System Debugging",
        type: "coding",
        description: "Real-time operating system debugging.",
        questions: ["Circular buffer concurrency in C", "Deadlock avoidance strategies"],
      },
    ],
    tips: "Deep dive into pointer arithmetic and volatile keyword usage in C.",
  },
  {
    companyIndex: 1,
    role: "Firmware Developer",
    year: "2025",
    driveType: "off-campus",
    difficulty: 3,
    outcome: "rejected",
    verified: false,
    anonymous: false,
    rounds: [
      {
        roundNumber: 1,
        name: "Technical Assessment",
        type: "coding",
        description: "Data packing and state machine design.",
        questions: ["Finite state machine implementation", "Endianness conversion function"],
      },
      {
        roundNumber: 2,
        name: "Managerial Fit",
        type: "hr",
        description: "Team dynamics and delivery under tight deadlines.",
        questions: ["Project delivery under hardware delays", "Continuous learning strategy"],
      },
    ],
    tips: "Revise state machines and communication bus protocols like SPI and I2C.",
  },
  {
    companyIndex: 1,
    role: "Hardware Test Analyst",
    year: "2023",
    driveType: "internship",
    difficulty: 2,
    outcome: "selected",
    verified: false,
    anonymous: false,
    rounds: [
      {
        roundNumber: 1,
        name: "Test Planning",
        type: "technical",
        description: "Automated test benches and validation methodologies.",
        questions: ["Signal integrity verification", "Automated test rack scripting"],
      },
      {
        roundNumber: 2,
        name: "HR Discussion",
        type: "hr",
        description: "Cultural fit and career aspirations.",
        questions: ["Long term career goals in hardware", "Handling repetitive testing tasks"],
      },
    ],
    tips: "Be prepared with hardware debugging methodologies.",
  },
  {
    companyIndex: 1,
    role: "Core Systems Intern",
    year: "2026",
    driveType: "on-campus",
    difficulty: 4,
    outcome: "waiting",
    verified: false,
    anonymous: true,
    rounds: [
      {
        roundNumber: 1,
        name: "Online Coding Test",
        type: "coding",
        description: "Data structures and string manipulation.",
        questions: ["String permutation checking", "Matrix spiral traversal"],
      },
    ],
    tips: "Practice standard algorithm problems on matrices and strings.",
  },

  // 3 experiences for Company 2 (SolarisSphere Tech)
  {
    companyIndex: 2,
    role: "Cloud Solutions Architect",
    year: "2024",
    driveType: "internship",
    difficulty: 4,
    outcome: "selected",
    verified: false,
    anonymous: false,
    rounds: [
      {
        roundNumber: 1,
        name: "Cloud Architecture",
        type: "technical",
        description: "Scalable microservices and cloud infrastructure design.",
        questions: ["Multi-region failover architecture", "VPC peering and network security", "Cost optimization in cloud storage"],
      },
      {
        roundNumber: 2,
        name: "Executive Interview",
        type: "other",
        description: "Technical roadmap planning and client presentation.",
        questions: ["Migrating monolithic databases to microservices", "Managing client cloud security expectations"],
      },
    ],
    tips: "Study well-architected cloud frameworks and high availability patterns.",
  },
  {
    companyIndex: 2,
    role: "Infrastructure Consultant",
    year: "2023",
    driveType: "off-campus",
    difficulty: 3,
    outcome: "rejected",
    verified: false,
    anonymous: false,
    rounds: [
      {
        roundNumber: 1,
        name: "System Design",
        type: "technical",
        description: "Distributed cache design and load balancing.",
        questions: ["Consistent hashing algorithms", "Load balancer session stickiness"],
      },
      {
        roundNumber: 2,
        name: "HR Interview",
        type: "hr",
        description: "Consulting soft skills and client interaction.",
        questions: ["Resolving conflicting client priorities", "Work-life balance in consulting"],
      },
    ],
    tips: "Focus on distributed system concepts like replication and partitioning.",
  },
  {
    companyIndex: 2,
    role: "Site Reliability Intern",
    year: "2025",
    driveType: "on-campus",
    difficulty: 3,
    outcome: "selected",
    verified: false,
    anonymous: false,
    rounds: [
      {
        roundNumber: 1,
        name: "Coding & Linux",
        type: "coding",
        description: "Algorithmic problem solving and system calls.",
        questions: ["Detect cycle in directed graph", "File descriptor management in Linux"],
      },
    ],
    tips: "Brush up on graph algorithms and basic Linux system observability tools.",
  },

  // 2 experiences for Company 3 (VerdantPeak Systems)
  {
    companyIndex: 3,
    role: "Security Analyst",
    year: "2024",
    driveType: "on-campus",
    difficulty: 4,
    outcome: "selected",
    verified: false,
    anonymous: false,
    rounds: [
      {
        roundNumber: 1,
        name: "Security Assessment",
        type: "technical",
        description: "Application security principles and vulnerability testing.",
        questions: ["OWASP top 10 vulnerabilities mitigation", "JWT signing and replay attack prevention"],
      },
      {
        roundNumber: 2,
        name: "Behavioral Round",
        type: "hr",
        description: "Ethical standards and team collaboration.",
        questions: ["Handling sensitive security disclosures", "Working with development teams on patch deadlines"],
      },
    ],
    tips: "Understand web application security vulnerabilities and secure header configurations.",
  },
  {
    companyIndex: 3,
    role: "Frontend Engineer",
    year: "2025",
    driveType: "off-campus",
    difficulty: 2,
    outcome: "waiting",
    verified: false,
    anonymous: false,
    rounds: [
      {
        roundNumber: 1,
        name: "Frontend Practical",
        type: "coding",
        description: "DOM manipulation and state management.",
        questions: ["Building an accessible modal component", "Virtual list rendering concepts"],
      },
    ],
    tips: "Focus on semantic HTML, CSS accessibility, and component state management.",
  },
];

/**
 * Main execution routine for seedDemo.
 */
async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const isRemove = args.includes("--remove");

  let confirmDbArg = null;
  const confirmIndex = args.indexOf("--confirm-db");
  if (confirmIndex !== -1 && args[confirmIndex + 1]) {
    confirmDbArg = args[confirmIndex + 1];
  } else {
    const eqArg = args.find((a) => a.startsWith("--confirm-db="));
    if (eqArg) confirmDbArg = eqArg.split("=")[1];
  }

  const mongoUri = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/blogdb_dev";
  const dbName = extractDatabaseName(mongoUri);

  // Print connection info with credentials masked
  console.log("=============================================================");
  console.log("BLOGIFY DEMO DATA MANAGEMENT");
  console.log("=============================================================");
  console.log(`Database Host/URI: ${maskUriCredentials(mongoUri)}`);
  console.log(`Database Name:     ${dbName}`);
  console.log(`Mode:              ${isDryRun ? "DRY RUN (No writes)" : isRemove ? "REMOVE DEMO DATA" : "SEED DEMO DATA"}`);

  // Safety check
  if (!isDatabaseSafe(dbName, confirmDbArg)) {
    console.error(`\n[SAFETY ERROR] Refusing to run on database "${dbName}".`);
    console.error("Database name must end with '_dev', '_test', or '_demo',");
    console.error(`or you must pass '--confirm-db ${dbName}' to explicitly allow.`);
    process.exit(1);
  }
  console.log("Database safety check: PASSED");

  if (isDryRun) {
    console.log("\n[DRY RUN] Simulating operations without database connection or modifications:");
    if (isRemove) {
      console.log("  - Would delete all demo experiences and their comments/reports via cascade");
      console.log("  - Would delete demo users (Demo Student, Demo Reader)");
      console.log("  - Would inspect demo companies (delete if unused, keep and unflag if referenced by real posts)");
      console.log("  - Would leave AuditLog and LoginActivity untouched");
    } else {
      console.log("  - Would upsert 4 fictional demo companies (AcroVibe Dynamics, QuantumPulse Logic, SolarisSphere Tech, VerdantPeak Systems)");
      console.log("  - Would upsert 2 demo users (Demo Student, Demo Reader) with random 64-char passwords");
      console.log("  - Would upsert 15 generic interview experiences (6, 4, 3, 2 across companies)");
      console.log("  - Would add 6 demo comments and 2 open reports");
      console.log("  - All demo records tagged with isDemo: true and demoKey");
    }
    console.log("\nDry run completed successfully. 0 records modified.");
    process.exit(0);
  }

  // Connect to database
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 20000 });
  console.log("Connected to MongoDB successfully.\n");

  try {
    if (isRemove) {
      // ─── REMOVE PROCEDURE ──────────────────────────────────────────────────
      console.log("Executing removal of demo data...");

      // 1. Find all demo blogs
      const demoBlogs = await Blog.find({ isDemo: true }).select("_id").lean();
      const demoBlogIds = demoBlogs.map((b) => b._id);
      let deletedBlogsCount = 0;
      let deletedCommentsCount = 0;
      let deletedReportsCount = 0;

      if (demoBlogIds.length > 0) {
        const cleanupResult = await deleteBlogsCascade(demoBlogIds);
        deletedBlogsCount = cleanupResult.deletedBlogs || 0;
        deletedCommentsCount = cleanupResult.deletedComments || 0;
        deletedReportsCount = cleanupResult.deletedReports || 0;
      }

      // Also clean up any lingering comments or reports authored by Demo Reader
      const demoUsers = await User.find({ isDemo: true }).select("_id").lean();
      const demoUserIds = demoUsers.map((u) => u._id);

      if (demoUserIds.length > 0) {
        const extraComments = await Comment.deleteMany({ createdBy: { $in: demoUserIds } });
        const extraReports = await Report.deleteMany({ reporter: { $in: demoUserIds } });
        deletedCommentsCount += extraComments.deletedCount || 0;
        deletedReportsCount += extraReports.deletedCount || 0;
      }

      // 2. Delete demo users
      const userDelResult = await User.deleteMany({ isDemo: true });
      const deletedUsersCount = userDelResult.deletedCount || 0;

      // 3. Inspect demo companies
      const demoCompanies = await Company.find({ isDemo: true });
      let deletedCompaniesCount = 0;
      let preservedCompaniesCount = 0;

      for (const comp of demoCompanies) {
        const nonDemoCount = await Blog.countDocuments({
          "experience.company": comp._id,
          isDemo: { $ne: true },
        });

        if (nonDemoCount > 0) {
          // Real users reference this company! Keep it, clear demoKey and isDemo
          await Company.updateOne(
            { _id: comp._id },
            { $set: { isDemo: false }, $unset: { demoKey: 1 } }
          );
          preservedCompaniesCount++;
          console.log(`  [PRESERVED] Company "${comp.name}" is referenced by ${nonDemoCount} non-demo post(s); converted to real company (isDemo: false, demoKey unset).`);
        } else {
          await Company.deleteOne({ _id: comp._id });
          deletedCompaniesCount++;
        }
      }

      console.log("\n=============================================================");
      console.log("DEMO REMOVAL SUMMARY");
      console.log("=============================================================");
      console.log(`Demo Experiences Deleted: ${deletedBlogsCount}`);
      console.log(`Comments Deleted:         ${deletedCommentsCount}`);
      console.log(`Reports Deleted:          ${deletedReportsCount}`);
      console.log(`Demo Users Deleted:       ${deletedUsersCount}`);
      console.log(`Demo Companies Deleted:   ${deletedCompaniesCount}`);
      console.log(`Demo Companies Preserved: ${preservedCompaniesCount}`);
      console.log("AuditLog and LoginActivity collections left untouched.");
      console.log("=============================================================");
    } else {
      // ─── SEED PROCEDURE ────────────────────────────────────────────────────
      console.log("Executing demo data seed (Idempotent upsert)...");

      let companiesCreated = 0;
      let usersCreated = 0;
      let experiencesCreated = 0;
      let commentsCreated = 0;
      let reportsCreated = 0;

      // 1. Upsert 4 Companies
      const companyDocs = [];
      const skippedCompanyIndices = new Set();
      let companiesSkipped = 0;

      for (let i = 0; i < DEMO_COMPANIES.length; i++) {
        const co = DEMO_COMPANIES[i];
        let existing = await Company.findOne({ demoKey: co.demoKey });
        if (!existing) {
          // Check if an active real company exists without isDemo
          const existingReal = await Company.findOne({
            $or: [{ normalizedKey: co.normalizedKey }, { name: co.name }],
          });

          if (existingReal && !existingReal.isDemo) {
            console.log(
              `  [SKIPPED REAL COMPANY] Real company "${existingReal.name}" already exists without isDemo. Skipping this company and all demo experiences, comments, and reports belonging to it.`
            );
            skippedCompanyIndices.add(i);
            companyDocs.push(null);
            companiesSkipped++;
            continue;
          }

          existing = await Company.create({
            name: co.name,
            slug: co.slug,
            normalizedKey: co.normalizedKey,
            aliases: co.aliases,
            isDemo: true,
            demoKey: co.demoKey,
          });
          companiesCreated++;
        }
        companyDocs.push(existing);
      }
      console.log(`Companies:   ${DEMO_COMPANIES.length - companiesSkipped} ensured (${companiesCreated} newly created, ${companiesSkipped} skipped due to real company collision)`);

      // 2. Upsert 2 Demo Users
      const randomPassword = crypto.randomBytes(32).toString("hex"); // 64 chars, never printed

      let demoStudent = await User.findOne({ demoKey: "demo-user-student" });
      if (!demoStudent) {
        demoStudent = await User.create({
          fullName: "Demo Student",
          email: "demo_student@example.test",
          password: randomPassword,
          role: "USER",
          status: "active",
          isDemo: true,
          demoKey: "demo-user-student",
          profileImageURL: "/Images/demo-student-avatar.svg",
        });
        usersCreated++;
      }

      let demoReader = await User.findOne({ demoKey: "demo-user-reader" });
      if (!demoReader) {
        demoReader = await User.create({
          fullName: "Demo Reader",
          email: "demo_reader@example.test",
          password: randomPassword,
          role: "USER",
          status: "active",
          isDemo: true,
          demoKey: "demo-user-reader",
          profileImageURL: "/Images/demo-reader-avatar.svg",
        });
        usersCreated++;
      }
      console.log(`Users:       2 ensured (${usersCreated} newly created)`);

      // 3. Upsert 15 Experiences
      const createdExperiences = {};
      let experiencesSkipped = 0;
      for (let i = 0; i < DEMO_EXPERIENCES_DATA.length; i++) {
        const item = DEMO_EXPERIENCES_DATA[i];
        if (skippedCompanyIndices.has(item.companyIndex) || !companyDocs[item.companyIndex]) {
          experiencesSkipped++;
          continue;
        }
        const targetCo = companyDocs[item.companyIndex];
        const demoKey = `demo-exp-${i + 1}`;

        // Validate payload rules & ensure zero contact info flags
        const payloadToValidate = {
          company: targetCo.name,
          role: item.role,
          driveType: item.driveType,
          year: item.year,
          difficulty: item.difficulty,
          outcome: item.outcome,
          tips: item.tips,
          story: item.story || "",
          anonymous: item.anonymous ? "on" : undefined,
          noContactDetails: "on",
          rounds: item.rounds,
        };

        const { isValid, errors } = parseAndValidateExperiencePayload(payloadToValidate);
        if (!isValid || Object.keys(errors).length > 0) {
          throw new Error(`Demo experience ${i + 1} failed payload validation: ${JSON.stringify(errors)}`);
        }

        // Check contact info flags on all text
        const textToCheck = [item.role, item.tips, item.story || ""]
          .concat(item.rounds.flatMap((r) => [r.name, r.description, ...(r.questions || [])]))
          .join(" ");
        const contactCheck = findContactInfo(textToCheck);
        if (contactCheck.hasContactInfo) {
          throw new Error(`Demo experience ${i + 1} flagged for contact info: ${JSON.stringify(contactCheck.flags)}`);
        }

        let expBlog = await Blog.findOne({ demoKey });
        if (!expBlog) {
          const title = `${targetCo.name} - ${item.role} (${item.year})`;
          const body = item.story || `Interview experience for ${item.role} at ${targetCo.name} (${item.year}).`;

          expBlog = await Blog.create({
            title,
            body,
            type: "experience",
            status: "published",
            createdBy: demoStudent._id,
            isDemo: true,
            demoKey,
            experience: {
              company: targetCo._id,
              role: item.role,
              driveType: item.driveType,
              year: item.year,
              difficulty: item.difficulty,
              outcome: item.outcome,
              tips: item.tips,
              anonymous: item.anonymous,
              verified: item.verified,
              rounds: item.rounds,
            },
          });
          experiencesCreated++;
        }
        createdExperiences[i] = expBlog;
      }
      console.log(`Experiences: ${DEMO_EXPERIENCES_DATA.length - experiencesSkipped} ensured (${experiencesCreated} newly created, ${experiencesSkipped} skipped)`);

      // 4. Upsert 6 Demo Comments on first 3 posts (2 comments each)
      let commentsSkipped = 0;
      for (let p = 0; p < 3; p++) {
        const post = createdExperiences[p];
        if (!post) {
          commentsSkipped += 2;
          continue;
        }
        for (let c = 1; c <= 2; c++) {
          const commentContent = `Helpful sample comment ${c} regarding interview preparation for ${post.title}.`;
          const existingComment = await Comment.findOne({
            blogId: post._id,
            createdBy: demoReader._id,
            content: commentContent,
          });
          if (!existingComment) {
            await Comment.create({
              content: commentContent,
              blogId: post._id,
              createdBy: demoReader._id,
            });
            commentsCreated++;
          }
        }
      }
      console.log(`Comments:    ${6 - commentsSkipped} ensured (${commentsCreated} newly created, ${commentsSkipped} skipped)`);

      // 5. Upsert 2 Demo Reports on posts 4 and 5
      const reportConfigs = [
        { expIndex: 3, reason: "abusive", note: "Sample demonstration report for moderator queue inspection." },
        { expIndex: 4, reason: "other", note: "Sample report to verify admin moderation dashboard filtering." },
      ];
      let reportsSkipped = 0;

      for (const rc of reportConfigs) {
        const post = createdExperiences[rc.expIndex];
        if (!post) {
          reportsSkipped++;
          continue;
        }
        const existingReport = await Report.findOne({
          blog: post._id,
          reporter: demoReader._id,
        });
        if (!existingReport) {
          await Report.create({
            blog: post._id,
            reporter: demoReader._id,
            reason: rc.reason,
            note: rc.note,
            status: "open",
          });
          reportsCreated++;
        }
      }
      console.log(`Reports:     ${reportConfigs.length - reportsSkipped} ensured (${reportsCreated} newly created, ${reportsSkipped} skipped)`);

      console.log("\n=============================================================");
      console.log("DEMO SEED COMPLETED SUCCESSFULLY");
      console.log("=============================================================");
      console.log(`New Companies Created:   ${companiesCreated}`);
      console.log(`New Users Created:       ${usersCreated}`);
      console.log(`New Experiences Created: ${experiencesCreated}`);
      console.log(`New Comments Created:    ${commentsCreated}`);
      console.log(`New Reports Created:     ${reportsCreated}`);
      console.log("All records tagged with isDemo: true and demoKey for clean removal.");
      console.log("=============================================================");
    }
  } finally {
    await mongoose.disconnect();
    console.log("Database connection closed.");
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("\n[SCRIPT ERROR]:", err);
    process.exit(1);
  });
}

module.exports = {
  isDatabaseSafe,
  extractDatabaseName,
  maskUriCredentials,
  DEMO_COMPANIES,
  DEMO_EXPERIENCES_DATA,
};
