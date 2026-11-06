const { Router } = require("express");
const mongoose = require("mongoose");
const Company = require("../models/company");
const Blog = require("../models/blog");
const { getPublicAuthor } = require("../services/anonymity");
const { resolveCompanyChain } = require("../services/company");

const router = Router();

// ─── GET /companies (Companies Directory) ───────────────────────────────────
router.get("/companies", async (req, res) => {
  try {
    const rawSearch = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 50) : "";
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 24;
    const skip = (page - 1) * limit;

    // Single aggregation: Count experiences per company, join company details, search & facet
    const pipeline = [
      {
        $match: {
          type: "experience",
          status: { $in: ["published", "featured"] },
        },
      },
      {
        $group: {
          _id: "$experience.company",
          experienceCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "companies",
          localField: "_id",
          foreignField: "_id",
          as: "company",
        },
      },
      { $unwind: "$company" },
      { $match: { "company.mergedInto": null } },
    ];

    if (rawSearch) {
      const escaped = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      pipeline.push({
        $match: {
          $or: [
            { "company.name": { $regex: escaped, $options: "i" } },
            { "company.aliases": { $regex: escaped, $options: "i" } },
          ],
        },
      });
    }

    pipeline.push({
      $facet: {
        total: [{ $count: "count" }],
        companies: [
          { $sort: { experienceCount: -1, "company.name": 1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: "$company._id",
              name: "$company.name",
              slug: "$company.slug",
              aliases: "$company.aliases",
              isDemo: { $ifNull: ["$company.isDemo", false] },
              experienceCount: 1,
            },
          },
        ],
      },
    });

    const [result] = await Blog.aggregate(pipeline);
    const totalCompanies = result?.total[0]?.count || 0;
    const totalPages = Math.ceil(totalCompanies / limit) || 1;
    const companies = result?.companies || [];

    return res.render("company/index", {
      user: req.user,
      companies,
      search: rawSearch,
      currentPage: page,
      totalPages,
      totalCompanies,
    });
  } catch (err) {
    console.error("Error loading companies list:", err);
    return res.status(500).render("error", {
      user: req.user,
      message: "Unable to load companies at this time.",
    });
  }
});

// ─── GET /company/:slug (Company Details & Analytics) ────────────────────────
router.get("/company/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    // Validate slug format (lowercase letters, digits, and hyphens, max 80 chars)
    if (!slug || typeof slug !== "string" || !/^[a-z0-9-]{1,80}$/.test(slug)) {
      return res.status(404).render("error", {
        user: req.user,
        message: "Company not found",
      });
    }

    // A current slug match always wins over previousSlugs
    let company = await Company.findOne({ slug }).lean();
    if (!company) {
      company = await Company.findOne({ previousSlugs: slug }).lean();
    }
    if (!company) {
      return res.status(404).render("error", {
        user: req.user,
        message: "Company not found",
      });
    }

    // Follow merge chain if merged
    const resolvedCompany = await resolveCompanyChain(company);

    // If company was merged OR accessed via an old slug, 301 redirect in 1 single hop!
    if (String(resolvedCompany._id) !== String(company._id) || resolvedCompany.slug !== slug) {
      return res.redirect(301, `/company/${resolvedCompany.slug}`);
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 10;
    const skip = (page - 1) * limit;

    // Find all companies merged into this company to combine stats
    const mergedCompanyIds = await Company.find({ mergedInto: company._id }).distinct("_id");
    const targetAndMergedIds = [company._id, ...mergedCompanyIds];

    // One aggregation: $match combining target and merged companies
    const [facetResults] = await Blog.aggregate([
      {
        $match: {
          type: "experience",
          status: { $in: ["published", "featured"] },
          "experience.company": { $in: targetAndMergedIds },
        },
      },
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          avgDifficulty: [
            {
              $group: {
                _id: null,
                avg: { $avg: "$experience.difficulty" },
              },
            },
          ],
          outcomeCounts: [
            {
              $group: {
                _id: "$experience.outcome",
                count: { $sum: 1 },
              },
            },
          ],
          roundTypes: [
            {
              $project: {
                uniqueRoundTypes: { $setUnion: ["$experience.rounds.type", []] },
              },
            },
            { $unwind: "$uniqueRoundTypes" },
            {
              $group: {
                _id: "$uniqueRoundTypes",
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1, _id: 1 } },
          ],
          avgRounds: [
            {
              $group: {
                _id: null,
                avg: { $avg: { $size: { $ifNull: ["$experience.rounds", []] } } },
              },
            },
          ],
          verifiedCount: [
            { $match: { "experience.verified": true } },
            { $count: "count" },
          ],
        },
      },
    ]);

    const totalCount = facetResults?.totalCount[0]?.count || 0;

    // Return friendly 404 if company exists but has zero published/featured experiences
    if (totalCount === 0) {
      return res.status(404).render("error", {
        user: req.user,
        message: "Company not found",
      });
    }

    const avgDifficulty = facetResults?.avgDifficulty[0]?.avg
      ? Number(facetResults.avgDifficulty[0].avg.toFixed(1))
      : 0;
    const avgRounds = facetResults?.avgRounds[0]?.avg
      ? Number(facetResults.avgRounds[0].avg.toFixed(1))
      : 0;
    const verifiedCount = facetResults?.verifiedCount[0]?.count || 0;

    // Process outcome breakdown
    const rawOutcomes = facetResults?.outcomeCounts || [];
    const outcomeMap = { selected: 0, rejected: 0, waiting: 0, undisclosed: 0 };
    rawOutcomes.forEach((o) => {
      if (outcomeMap[o._id] !== undefined) {
        outcomeMap[o._id] = o.count;
      }
    });

    const disclosedTotal = outcomeMap.selected + outcomeMap.rejected + outcomeMap.waiting;
    const outcomePercentages = {
      selected: disclosedTotal > 0 ? Math.round((outcomeMap.selected / disclosedTotal) * 100) : 0,
      rejected: disclosedTotal > 0 ? Math.round((outcomeMap.rejected / disclosedTotal) * 100) : 0,
      waiting: disclosedTotal > 0 ? Math.round((outcomeMap.waiting / disclosedTotal) * 100) : 0,
    };

    // Process round type frequency
    const rawRoundTypes = facetResults?.roundTypes || [];
    const roundTypes = rawRoundTypes.map((rt) => ({
      type: rt._id,
      count: rt.count,
      percentage: totalCount > 0 ? Math.round((rt.count / totalCount) * 100) : 0,
    }));

    const stats = {
      totalCount,
      avgDifficulty,
      avgRounds,
      verifiedCount,
      outcomeCounts: outcomeMap,
      disclosedTotal,
      outcomePercentages,
      roundTypes,
    };

    // Query paginated experiences for this company
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const rawExperiences = await Blog.find({
      type: "experience",
      status: { $in: ["published", "featured"] },
      "experience.company": { $in: targetAndMergedIds },
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "fullName profileImageURL email")
      .lean();

    // Check if any demo experiences exist for this company
    const hasDemoExperience = Boolean(
      company.isDemo ||
      await Blog.exists({
        "experience.company": { $in: targetAndMergedIds },
        isDemo: true,
      })
    );

    // Map to view-models (strictly omit raw Blog or createdBy)
    const experiences = rawExperiences.map((exp) => ({
      id: exp._id.toString(),
      role: exp.experience?.role || "",
      year: exp.experience?.year || "",
      driveType: exp.experience?.driveType || "",
      outcome: exp.experience?.outcome || "undisclosed",
      difficulty: exp.experience?.difficulty || 3,
      verified: Boolean(exp.experience?.verified),
      isDemo: Boolean(exp.isDemo),
      createdAt: exp.createdAt,
      author: getPublicAuthor(exp),
    }));

    return res.render("company/detail", {
      user: req.user,
      company,
      hasDemoExperience,
      stats,
      experiences,
      currentPage: page,
      totalPages,
    });
  } catch (err) {
    console.error("Error loading company page:", err);
    return res.status(500).render("error", {
      user: req.user,
      message: "Unable to load company details at this time.",
    });
  }
});

module.exports = router;

