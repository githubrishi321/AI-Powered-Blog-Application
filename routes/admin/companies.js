const { Router } = require("express");
const router = Router();
const mongoose = require("mongoose");
const Company = require("../../models/company");
const Blog = require("../../models/blog");
const { logAudit } = require("../../services/auditLogger");
const {
  validateCompanyName,
  normalizeKey,
  addAlias,
  removeAlias,
  mergeCompanies,
  resolveCompanyChain,
} = require("../../services/company");

function getIP(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

// GET /admin/companies — List companies with search and pagination
router.get("/", async (req, res) => {
  try {
    const rawSearch = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 50) : "";
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;

    const query = {};
    if (rawSearch) {
      const escaped = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { name: { $regex: new RegExp(escaped, "i") } },
        { aliases: { $regex: new RegExp(escaped, "i") } },
      ];
    }

    const [companies, total] = await Promise.all([
      Company.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .populate("mergedInto", "name slug")
        .lean(),
      Company.countDocuments(query),
    ]);

    // Aggregate published and hidden counts for experiences referencing these companies
    const compIds = companies.map((c) => c._id);
    const countsAgg = await Blog.aggregate([
      {
        $match: {
          type: "experience",
          "experience.company": { $in: compIds },
        },
      },
      {
        $group: {
          _id: { company: "$experience.company", status: "$status" },
          count: { $sum: 1 },
        },
      },
    ]);

    const countsMap = {};
    for (const row of countsAgg) {
      const cid = String(row._id.company);
      if (!countsMap[cid]) countsMap[cid] = { published: 0, hidden: 0 };
      if (["published", "featured"].includes(row._id.status)) {
        countsMap[cid].published += row.count;
      } else if (row._id.status === "hidden") {
        countsMap[cid].hidden += row.count;
      }
    }

    const companyViewModels = companies.map((c) => {
      const cid = String(c._id);
      return {
        _id: c._id,
        name: c.name,
        slug: c.slug,
        aliases: c.aliases || [],
        publishedCount: countsMap[cid]?.published || 0,
        hiddenCount: countsMap[cid]?.hidden || 0,
        mergedInto: c.mergedInto ? { _id: c.mergedInto._id, name: c.mergedInto.name, slug: c.mergedInto.slug } : null,
        mergedAt: c.mergedAt,
        isDemo: Boolean(c.isDemo),
      };
    });

    const pages = Math.max(1, Math.ceil(total / limit));

    res.render("admin/companies/index", {
      user: req.user,
      currentPage: "companies",
      companies: companyViewModels,
      total,
      page,
      pages,
      search: rawSearch,
      flash: res.locals.flash || (req.flash ? req.flash() : {}),
      csrfToken: res.locals.csrfToken,
    });
  } catch (err) {
    console.error("Admin companies list error:", err);
    res.status(500).render("error", { user: req.user, message: "Failed to load companies." });
  }
});

// GET /admin/companies/search-targets — Target company search for merge modal
router.get("/search-targets", async (req, res) => {
  try {
    const rawQ = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 50) : "";
    const excludeId = typeof req.query.excludeId === "string" ? req.query.excludeId.trim() : null;

    const query = { mergedInto: null };
    if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
      query._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    }

    if (rawQ) {
      const escaped = rawQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { name: { $regex: new RegExp(escaped, "i") } },
        { aliases: { $regex: new RegExp(escaped, "i") } },
      ];
    }

    const targets = await Company.find(query)
      .select("name slug aliases")
      .sort({ name: 1 })
      .limit(20)
      .lean();

    res.json({ targets });
  } catch (err) {
    console.error("Target search error:", err);
    res.status(500).json({ error: "Failed to search targets." });
  }
});

// GET /admin/companies/:id — Company detail & action management
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).render("error", { user: req.user, message: "Company not found." });
    }

    const company = await Company.findById(req.params.id)
      .populate("mergedInto", "name slug")
      .lean();

    if (!company) {
      return res.status(404).render("error", { user: req.user, message: "Company not found." });
    }

    const [publishedCount, hiddenCount, totalBlogs, mergedCompanies] = await Promise.all([
      Blog.countDocuments({
        "experience.company": company._id,
        type: "experience",
        status: { $in: ["published", "featured"] },
      }),
      Blog.countDocuments({
        "experience.company": company._id,
        type: "experience",
        status: "hidden",
      }),
      Blog.countDocuments({ "experience.company": company._id }),
      Company.find({ mergedInto: company._id }).select("name slug mergedAt").lean(),
    ]);

    res.render("admin/companies/detail", {
      user: req.user,
      currentPage: "companies",
      company,
      stats: {
        publishedCount,
        hiddenCount,
        totalBlogs,
        mergedCompaniesCount: mergedCompanies.length,
        mergedCompanies,
      },
      flash: res.locals.flash || (req.flash ? req.flash() : {}),
      csrfToken: res.locals.csrfToken,
    });
  } catch (err) {
    console.error("Admin company detail error:", err);
    res.status(500).render("error", { user: req.user, message: "Failed to load company details." });
  }
});

// POST /admin/companies/:id/rename — Rename company
router.post("/:id/rename", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).render("error", { user: req.user, message: "Company not found." });
    }

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).render("error", { user: req.user, message: "Company not found." });
    }

    let newName;
    try {
      newName = validateCompanyName(req.body.name);
    } catch (valErr) {
      if (req.flash) req.flash("error", valErr.message);
      return res.redirect(`/admin/companies/${company._id}`);
    }

    const newKey = normalizeKey(newName);

    // Collision check against another active company's name, key, or aliases
    const escapedKey = newKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const collision = await Company.findOne({
      _id: { $ne: company._id },
      mergedInto: null,
      $or: [
        { normalizedKey: newKey },
        { name: { $regex: new RegExp(`^${escapedKey}$`, "i") } },
        { aliases: { $regex: new RegExp(`^${escapedKey}$`, "i") } },
      ],
    });

    if (collision) {
      if (req.flash) {
        req.flash(
          "error",
          `Company name collides with active company "${collision.name}". Consider merging these companies instead.`
        );
      }
      return res.redirect(`/admin/companies/${company._id}`);
    }

    const oldName = company.name;
    const before = {
      name: company.name,
      normalizedKey: company.normalizedKey,
      aliases: [...(company.aliases || [])],
    };

    company.name = newName;
    company.normalizedKey = newKey;

    let aliasFlashNote = "";
    const keepOldAsAlias =
      req.body.keepOldAsAlias === "1" ||
      req.body.keepOldAsAlias === "on" ||
      req.body.keepOldAsAlias === true;

    if (keepOldAsAlias && oldName !== newName) {
      const oldKey = normalizeKey(oldName);
      if (!company.aliases) company.aliases = [];
      const alreadyHas = company.aliases.some((a) => normalizeKey(a) === oldKey);

      if (!alreadyHas) {
        if (company.aliases.length >= 50) {
          aliasFlashNote = ` Note: Old name "${oldName}" could not be kept as an alias (limit of 50 aliases reached).`;
        } else {
          // Check collision against other active companies
          const escapedOld = oldKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const collisionCo = await Company.findOne({
            _id: { $ne: company._id },
            mergedInto: { $ne: company._id },
            $or: [
              { normalizedKey: oldKey },
              { name: { $regex: new RegExp(`^${escapedOld}$`, "i") } },
              { aliases: { $regex: new RegExp(`^${escapedOld}$`, "i") } },
            ],
          });

          if (collisionCo) {
            aliasFlashNote = ` Note: Old name "${oldName}" could not be kept as an alias due to a collision with "${collisionCo.name}".`;
          } else {
            company.aliases.push(oldName);
          }
        }
      }
    }

    await company.save();

    await logAudit({
      admin: req.user,
      action: "company.rename",
      targetType: "company",
      targetId: company._id,
      targetLabel: company.name,
      before,
      after: {
        name: company.name,
        normalizedKey: company.normalizedKey,
        aliases: company.aliases,
      },
      ip: getIP(req),
    });

    if (req.flash) {
      req.flash("success", `Company renamed successfully.${aliasFlashNote}`);
    }
    res.redirect(`/admin/companies/${company._id}`);
  } catch (err) {
    console.error("Admin rename company error:", err);
    if (req.flash) req.flash("error", "Error renaming company: " + err.message);
    res.redirect(`/admin/companies/${req.params.id}`);
  }
});

// POST /admin/companies/:id/slug — Change slug
router.post("/:id/slug", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).render("error", { user: req.user, message: "Company not found." });
    }

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).render("error", { user: req.user, message: "Company not found." });
    }

    const rawSlug = typeof req.body.slug === "string" ? req.body.slug.trim().toLowerCase() : "";
    if (!rawSlug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(rawSlug) || rawSlug.length > 80) {
      if (req.flash) {
        req.flash("error", "Slug must contain only lowercase letters, digits, and hyphens (maximum 80 characters).");
      }
      return res.redirect(`/admin/companies/${company._id}`);
    }

    if (rawSlug === company.slug) {
      if (req.flash) req.flash("info", "Slug unchanged.");
      return res.redirect(`/admin/companies/${company._id}`);
    }

    // Unique check against all companies' slugs and previousSlugs
    const collision = await Company.findOne({
      _id: { $ne: company._id },
      $or: [{ slug: rawSlug }, { previousSlugs: rawSlug }],
    });

    if (collision) {
      if (req.flash) req.flash("error", `Slug "${rawSlug}" is already in use by company "${collision.name}".`);
      return res.redirect(`/admin/companies/${company._id}`);
    }

    const oldSlug = company.slug;
    if (!company.previousSlugs) company.previousSlugs = [];
    // Remove the new slug from company's own previousSlugs if present
    company.previousSlugs = company.previousSlugs.filter((s) => s !== rawSlug);
    if (oldSlug && !company.previousSlugs.includes(oldSlug)) {
      company.previousSlugs.push(oldSlug);
    }
    company.slug = rawSlug;
    await company.save();

    await logAudit({
      admin: req.user,
      action: "company.slug_change",
      targetType: "company",
      targetId: company._id,
      targetLabel: company.name,
      before: { slug: oldSlug },
      after: { slug: company.slug, previousSlugs: company.previousSlugs },
      ip: getIP(req),
    });

    if (req.flash) req.flash("success", `Slug updated to "${rawSlug}". Old slug will redirect with 301.`);
    res.redirect(`/admin/companies/${company._id}`);
  } catch (err) {
    console.error("Admin slug change error:", err);
    if (req.flash) req.flash("error", "Error updating slug: " + err.message);
    res.redirect(`/admin/companies/${req.params.id}`);
  }
});

// POST /admin/companies/:id/aliases/add — Add alias
router.post("/:id/aliases/add", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).render("error", { user: req.user, message: "Company not found." });
    }

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).render("error", { user: req.user, message: "Company not found." });
    }

    try {
      await addAlias(company._id, req.body.alias);
    } catch (aliasErr) {
      if (req.flash) req.flash("error", aliasErr.message);
      return res.redirect(`/admin/companies/${company._id}`);
    }

    await logAudit({
      admin: req.user,
      action: "company.alias_add",
      targetType: "company",
      targetId: company._id,
      targetLabel: company.name,
      after: { alias: req.body.alias },
      ip: getIP(req),
    });

    if (req.flash) req.flash("success", `Alias "${req.body.alias}" added.`);
    res.redirect(`/admin/companies/${company._id}`);
  } catch (err) {
    console.error("Admin add alias error:", err);
    if (req.flash) req.flash("error", "Error adding alias: " + err.message);
    res.redirect(`/admin/companies/${req.params.id}`);
  }
});

// POST /admin/companies/:id/aliases/remove — Remove alias
router.post("/:id/aliases/remove", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).render("error", { user: req.user, message: "Company not found." });
    }

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).render("error", { user: req.user, message: "Company not found." });
    }

    const aliasToRemove = typeof req.body.alias === "string" ? req.body.alias.trim() : "";
    await removeAlias(company._id, aliasToRemove);

    await logAudit({
      admin: req.user,
      action: "company.alias_remove",
      targetType: "company",
      targetId: company._id,
      targetLabel: company.name,
      before: { alias: aliasToRemove },
      ip: getIP(req),
    });

    if (req.flash) req.flash("success", `Alias "${aliasToRemove}" removed.`);
    res.redirect(`/admin/companies/${company._id}`);
  } catch (err) {
    console.error("Admin remove alias error:", err);
    if (req.flash) req.flash("error", "Error removing alias: " + err.message);
    res.redirect(`/admin/companies/${req.params.id}`);
  }
});

// POST /admin/companies/:id/delete — Delete company
router.post("/:id/delete", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).render("error", { user: req.user, message: "Company not found." });
    }

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).render("error", { user: req.user, message: "Company not found." });
    }

    // Guard 1: Any blogs reference it?
    const referencingBlogsCount = await Blog.countDocuments({ "experience.company": company._id });
    if (referencingBlogsCount > 0) {
      if (req.flash) {
        req.flash(
          "error",
          `Cannot delete company "${company.name}": ${referencingBlogsCount} interview experience(s) reference this company.`
        );
      }
      return res.redirect(`/admin/companies/${company._id}`);
    }

    // Guard 2: Any companies merged into it?
    const mergedIntoThisCount = await Company.countDocuments({ mergedInto: company._id });
    if (mergedIntoThisCount > 0) {
      if (req.flash) {
        req.flash(
          "error",
          `Cannot delete company "${company.name}": ${mergedIntoThisCount} other company/companies have been merged into it.`
        );
      }
      return res.redirect(`/admin/companies/${company._id}`);
    }

    // Guard 3: Has this company been merged into another?
    if (company.mergedInto) {
      if (req.flash) {
        req.flash(
          "error",
          `Cannot delete company "${company.name}": This company has been merged into another company and its redirects must be preserved.`
        );
      }
      return res.redirect(`/admin/companies/${company._id}`);
    }

    await Company.deleteOne({ _id: company._id });

    await logAudit({
      admin: req.user,
      action: "company.delete",
      targetType: "company",
      targetId: company._id,
      targetLabel: company.name,
      before: { name: company.name, slug: company.slug },
      ip: getIP(req),
    });

    if (req.flash) req.flash("success", `Company "${company.name}" deleted successfully.`);
    res.redirect("/admin/companies");
  } catch (err) {
    console.error("Admin delete company error:", err);
    if (req.flash) req.flash("error", "Error deleting company: " + err.message);
    res.redirect(`/admin/companies/${req.params.id}`);
  }
});

// POST /admin/companies/:id/merge — Merge company into target
router.post("/:id/merge", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).render("error", { user: req.user, message: "Source company not found." });
    }

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).render("error", { user: req.user, message: "Source company not found." });
    }

    const { targetId, confirmName } = req.body;

    if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
      if (req.flash) req.flash("error", "Please select a valid target company.");
      return res.redirect(`/admin/companies/${company._id}`);
    }

    if (typeof confirmName !== "string" || confirmName.trim() !== company.name.trim()) {
      if (req.flash) {
        req.flash("error", `Confirmation failed: you must type the exact source company name "${company.name}" to confirm.`);
      }
      return res.redirect(`/admin/companies/${company._id}`);
    }

    const mergeResult = await mergeCompanies(company._id, targetId, req.user);

    if (req.flash) req.flash("success", mergeResult.message);
    res.redirect(`/admin/companies/${targetId}`);
  } catch (err) {
    console.error("Admin merge error:", err);
    if (req.flash) req.flash("error", "Merge failed: " + err.message);
    res.redirect(`/admin/companies/${req.params.id}`);
  }
});

module.exports = router;

