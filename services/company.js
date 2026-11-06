const Company = require("../models/company");
const { logAudit } = require("./auditLogger");

function getActorIp(actor) {
  return actor?.ip || actor?.req?.socket?.remoteAddress || "unknown";
}

/**
 * Resolves a company document along its mergedInto chain.
 * Follows mergedInto up to maxDepth (5). Detects cycles and throws Error.
 *
 * @param {import("../models/company")} company
 * @param {number} maxDepth
 * @returns {Promise<import("../models/company")>}
 */
async function resolveCompanyChain(company, maxDepth = 5) {
  if (!company || !company.mergedInto) return company;

  let current = company;
  const visited = new Set([String(current._id)]);
  let depth = 0;

  while (current.mergedInto) {
    depth++;
    if (depth > maxDepth) {
      throw new Error(`Company merge resolution exceeded maximum depth of ${maxDepth}.`);
    }
    const nextId = String(current.mergedInto);
    if (visited.has(nextId)) {
      throw new Error(`Cycle detected in company merge chain at company ID ${nextId}.`);
    }
    visited.add(nextId);

    const nextCompany = await Company.findById(nextId);
    if (!nextCompany) {
      // Dangling merge pointer; stop at current
      break;
    }
    current = nextCompany;
  }
  return current;
}

/**
 * Validates and sanitizes a company or alias name:
 * - Collapses all internal whitespace (tabs, newlines, repeated spaces) to a single space
 * - Trims leading and trailing whitespace
 * - 2 to 60 characters
 * - Allows Unicode letters (\p{L}) and digits (\p{N})
 * - Allows punctuation: & . , - ' ( ) +
 * - Rejects control characters (\p{C})
 * - Rejects digits-only names
 *
 * @param {string} rawName
 * @returns {string} Sanitized, collapsed name
 * @throws {Error} If validation fails
 */
function validateCompanyName(rawName) {
  if (!rawName || typeof rawName !== "string") {
    throw new Error("Company name is required and must be a string.");
  }

  // 1. Normalize to Unicode NFC and collapse all internal whitespace
  const nfc = rawName.normalize("NFC");
  const collapsed = nfc.replace(/\s+/g, " ").trim();

  // 2. Length check: 2 to 60 characters
  if (collapsed.length < 2 || collapsed.length > 60) {
    throw new Error("Company name must be between 2 and 60 characters long.");
  }

  // 3. Reject control characters (\p{C})
  if (/[\p{C}]/u.test(collapsed)) {
    throw new Error("Company name cannot contain control characters.");
  }

  // 4. Reject digits-only names
  if (/^[\p{N}\s]+$/u.test(collapsed)) {
    throw new Error("Company name cannot be digits only.");
  }

  // 5. Allowed characters: Unicode letters (\p{L}), digits (\p{N}), combining marks (\p{M}), spaces, and & . , - ' ( ) +
  const allowedPattern = /^[\p{L}\p{N}\p{M}\s&.,'\-()+]+$/u;
  if (!allowedPattern.test(collapsed)) {
    throw new Error(
      "Company name contains invalid characters. Allowed: letters, numbers, spaces, and & . , - ' ( ) +"
    );
  }

  return collapsed;
}

/**
 * Normalizes a company name for deduplication:
 * Normalizes to Unicode NFC, trims leading/trailing whitespace, converts to lowercase,
 * and collapses multiple whitespace characters into a single space.
 * Example: "  Nestlé   Inc  " -> "nestlé inc"
 *
 * @param {string} name
 * @returns {string}
 */
function normalizeKey(name) {
  if (!name || typeof name !== "string") return "";
  return name.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Generates a URL-friendly slug from a company name.
 * De-accents Unicode characters (e.g. Nestlé -> nestle).
 * Example: "Nestlé Inc." -> "nestle-inc"
 *
 * @param {string} name
 * @returns {string}
 */
function generateSlug(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Finds an existing company or creates a new one.
 * Follows mergedInto chains so that merged companies resolve to their target.
 * Matches case-insensitively against normalizedKey, name, and aliases.
 *
 * @param {string} rawName
 * @returns {Promise<Company>}
 */
async function findOrCreateCompany(rawName) {
  const collapsedName = validateCompanyName(rawName);
  const key = normalizeKey(collapsedName);

  // 1. Check if normalizedKey matches exactly
  let company = await Company.findOne({ normalizedKey: key });
  if (company) {
    return await resolveCompanyChain(company);
  }

  // 2. Check if any existing company has this name in aliases or matches case-insensitively
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  company = await Company.findOne({
    $or: [
      { name: { $regex: new RegExp(`^${escapedKey}$`, "i") } },
      { aliases: { $regex: new RegExp(`^${escapedKey}$`, "i") } },
    ],
  });
  if (company) {
    return await resolveCompanyChain(company);
  }

  // 3. Not found: create a new company
  let baseSlug = generateSlug(collapsedName) || "company";
  let slug = baseSlug;
  let counter = 1;

  while (await Company.findOne({ slug })) {
    slug = `${baseSlug}-${counter++}`;
  }

  try {
    company = await Company.create({
      name: collapsedName,
      slug,
      normalizedKey: key,
      aliases: [],
      mergedInto: null,
      mergedAt: null,
      previousSlugs: [],
    });
    return company;
  } catch (err) {
    if (err.code === 11000) {
      // Re-fetch by normalizedKey ONLY, never by slug
      company = await Company.findOne({ normalizedKey: key });
      if (company) {
        return await resolveCompanyChain(company);
      }

      // If no company has that normalizedKey, the clash was on slug.
      // Regenerate the slug and retry creation once.
      let retrySlug = `${slug}-${Date.now().toString(36)}`;
      while (await Company.findOne({ slug: retrySlug })) {
        retrySlug = `${slug}-${Math.random().toString(36).substring(2, 6)}`;
      }
      company = await Company.create({
        name: collapsedName,
        slug: retrySlug,
        normalizedKey: key,
        aliases: [],
        mergedInto: null,
        mergedAt: null,
        previousSlugs: [],
      });
      return company;
    }
    throw err;
  }
}

/**
 * Adds an alias to an existing company.
 * Follows mergedInto chains. Maximum 50 aliases.
 * Collision checks ignore companies merged into the company being edited.
 *
 * @param {string|import("mongoose").Types.ObjectId} companyId
 * @param {string} alias
 * @returns {Promise<Company>}
 */
async function addAlias(companyId, alias) {
  const validAlias = validateCompanyName(alias);
  const key = normalizeKey(validAlias);

  let company = await Company.findById(companyId);
  if (!company) {
    throw new Error("Company not found");
  }

  // Follow merge chain if target was merged
  company = await resolveCompanyChain(company);

  // If alias matches this company's own primary name, no need to add as alias
  if (company.normalizedKey === key) {
    return company;
  }

  // If already an alias on this company, return unchanged
  if (company.aliases && company.aliases.some((a) => normalizeKey(a) === key)) {
    return company;
  }

  // Maximum 50 aliases
  if (company.aliases && company.aliases.length >= 50) {
    throw new Error("A company can have a maximum of 50 aliases.");
  }

  // Check collision with ANY OTHER active company's name, normalizedKey, or aliases.
  // Collision checks ignore companies merged into the company being edited.
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const candidates = await Company.find({
    _id: { $ne: company._id },
    mergedInto: { $ne: company._id },
    $or: [
      { normalizedKey: key },
      { name: { $regex: new RegExp(`^${escapedKey}$`, "i") } },
      { aliases: { $regex: new RegExp(`^${escapedKey}$`, "i") } },
    ],
  });

  for (const candidate of candidates) {
    const resolvedCandidate = await resolveCompanyChain(candidate);
    if (String(resolvedCandidate._id) !== String(company._id)) {
      throw new Error(
        `Cannot add alias '${validAlias}': collides with existing company '${resolvedCandidate.name}'`
      );
    }
  }

  if (!company.aliases) company.aliases = [];
  company.aliases.push(validAlias);
  await company.save();
  return company;
}

/**
 * Removes an alias from an existing company.
 * Follows mergedInto chains.
 *
 * @param {string|import("mongoose").Types.ObjectId} companyId
 * @param {string} alias
 * @returns {Promise<Company>}
 */
async function removeAlias(companyId, alias) {
  let company = await Company.findById(companyId);
  if (!company) {
    throw new Error("Company not found");
  }
  company = await resolveCompanyChain(company);

  const key = normalizeKey(alias);
  company.aliases = (company.aliases || []).filter((a) => normalizeKey(a) !== key);
  await company.save();
  return company;
}

const activeMergeLocks = new Map();

/**
 * Merges source company into target company.
 * Idempotent, ordered, and resumable without multi-document transactions:
 * 1) Validate: source != target, neither is already merged to other, target is active, no cycle.
 * 2) Set source.mergedInto and mergedAt FIRST so new posts immediately resolve to target.
 * 3) Add source name and aliases to target aliases, deduplicated by normalized key.
 * 4) Move experiences: update every blog whose experience.company is source to target.
 * 5) Check that zero blogs still reference the source.
 * 6) Write AuditLog entry without author identity.
 *
 * @param {string|import("mongoose").Types.ObjectId} sourceId
 * @param {string|import("mongoose").Types.ObjectId} targetId
 * @param {object} actor
 * @returns {Promise<{ success: boolean, experiencesMoved: number, aliasesAdded: number, message: string }>}
 */
async function mergeCompanies(sourceId, targetId, actor, options = {}) {
  if (String(sourceId) === String(targetId)) {
    throw new Error("Source and target company cannot be the same.");
  }

  // Internal test hook to bypass process-local mutex (never enabled by any route, refused in production)
  if (options.bypassMutex) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Bypassing mutex is strictly forbidden in production.");
    }
    return await doMergeCompanies(sourceId, targetId, actor, options);
  }

  const lockKey = [String(sourceId), String(targetId)].sort().join(":");
  while (activeMergeLocks.has(lockKey)) {
    await activeMergeLocks.get(lockKey);
  }
  let resolveLock;
  const lockPromise = new Promise((resolve) => {
    resolveLock = resolve;
  });
  activeMergeLocks.set(lockKey, lockPromise);

  try {
    return await doMergeCompanies(sourceId, targetId, actor, options);
  } finally {
    activeMergeLocks.delete(lockKey);
    if (resolveLock) resolveLock();
  }
}

async function doMergeCompanies(sourceId, targetId, actor, options = {}) {

  const [source, target] = await Promise.all([
    Company.findById(sourceId),
    Company.findById(targetId),
  ]);

  if (!source) throw new Error("Source company not found.");
  if (!target) throw new Error("Target company not found.");

  // Target must be active
  if (target.mergedInto) {
    throw new Error("Target company has already been merged into another company.");
  }

  // Source already merged check:
  // If merged into the SAME target, resume/re-run!
  // If merged into a DIFFERENT target, reject!
  if (source.mergedInto && String(source.mergedInto) !== String(target._id)) {
    throw new Error("Source company has already been merged into a different company.");
  }

  // Cycle check: verify target merge chain does not resolve to source
  const initialResolvedTarget = await resolveCompanyChain(target);
  if (String(initialResolvedTarget._id) === String(source._id)) {
    throw new Error("Cycle detected: target company resolves to source company.");
  }

  // Check alias cap before step 2:
  // Target alias count plus new deduplicated aliases must stay <= 100
  const targetAliases = target.aliases || [];
  const targetKeys = new Set([
    normalizeKey(target.name),
    ...targetAliases.map((a) => normalizeKey(a)),
  ]);
  const candidateAliases = [source.name, ...(source.aliases || [])];
  let newAliasesCount = 0;
  for (const cand of candidateAliases) {
    if (!cand) continue;
    const k = normalizeKey(cand);
    if (!targetKeys.has(k)) {
      targetKeys.add(k);
      newAliasesCount++;
    }
  }

  if (targetAliases.length + newAliasesCount > 100) {
    throw new Error(
      `Merge rejected: Target company would exceed the limit of 100 aliases (target currently has ${targetAliases.length} aliases, merge would add ${newAliasesCount} aliases).`
    );
  }

  // Step 2: Set source.mergedInto and mergedAt FIRST
  // Setting mergedInto must be ONE conditional update whose filter requires
  // mergedInto null on source and mergedInto null on target, checking matched count.
  const isAlreadyMergedToSame =
    source.mergedInto && String(source.mergedInto) === String(target._id);

  if (!isAlreadyMergedToSame) {
    const updateResult = await Company.updateMany(
      {
        _id: { $in: [source._id, target._id] },
        mergedInto: null,
      },
      [
        {
          $set: {
            mergedInto: {
              $cond: {
                if: { $eq: ["$_id", source._id] },
                then: target._id,
                else: "$mergedInto",
              },
            },
            mergedAt: {
              $cond: {
                if: { $eq: ["$_id", source._id] },
                then: { $ifNull: ["$mergedAt", new Date()] },
                else: "$mergedAt",
              },
            },
          },
        },
      ]
    );

    if (updateResult.matchedCount !== 2) {
      await Company.updateOne(
        { _id: source._id, mergedInto: target._id },
        { $set: { mergedInto: null, mergedAt: null } }
      );
      throw new Error(
        "Merge rejected: Source or target company is already merged or no longer active."
      );
    }

    // Re-resolve target chain: if it leads back to source, revert update (conditional) and reject with friendly message
    const freshTarget = await Company.findById(target._id);
    let leadsToSource = false;
    try {
      const postResolvedTarget = await resolveCompanyChain(freshTarget);
      if (postResolvedTarget && String(postResolvedTarget._id) === String(source._id)) {
        leadsToSource = true;
      }
    } catch (cycleErr) {
      leadsToSource = true;
    }

    if (leadsToSource) {
      await Company.updateOne(
        { _id: source._id, mergedInto: target._id },
        { $set: { mergedInto: null, mergedAt: null } }
      );
      throw new Error("Merge rejected: Cycle detected in company merge chain.");
    }
  }

  if (typeof options.afterStep2 === "function") {
    await options.afterStep2();
  }

  // Step 3: Add source name and aliases to target aliases, deduplicated by normalized key
  let aliasesAdded = 0;
  const freshTarget = await Company.findById(target._id);
  if (!freshTarget.aliases) freshTarget.aliases = [];
  const freshTargetKeys = new Set([
    normalizeKey(freshTarget.name),
    ...freshTarget.aliases.map((a) => normalizeKey(a)),
  ]);

  for (const cand of candidateAliases) {
    if (!cand) continue;
    const k = normalizeKey(cand);
    if (!freshTargetKeys.has(k)) {
      freshTargetKeys.add(k);
      freshTarget.aliases.push(cand);
      aliasesAdded++;
    }
  }
  await freshTarget.save();

  // Step 4: Move experiences (all statuses including hidden)
  const Blog = require("../models/blog");
  let updateResult = await Blog.updateMany(
    { "experience.company": source._id },
    { $set: { "experience.company": target._id } }
  );
  let experiencesMoved = updateResult.modifiedCount || 0;

  // Step 5: Check zero blogs still reference the source
  let remaining = await Blog.countDocuments({ "experience.company": source._id });
  let retries = 0;
  while (remaining > 0 && retries < 3) {
    retries++;
    const retryUpdate = await Blog.updateMany(
      { "experience.company": source._id },
      { $set: { "experience.company": target._id } }
    );
    experiencesMoved += retryUpdate.modifiedCount || 0;
    remaining = await Blog.countDocuments({ "experience.company": source._id });
  }

  if (remaining > 0) {
    throw new Error(`Merge incomplete: ${remaining} experiences still reference source company.`);
  }

  // Step 6: Write AuditLog entry (NO author identity!)
  await logAudit({
    admin: actor,
    action: "company.merge",
    targetType: "company",
    targetId: target._id,
    targetLabel: `${source.name} -> ${target.name}`,
    before: {
      source: { id: String(source._id), name: source.name, slug: source.slug },
      target: { id: String(target._id), name: target.name, slug: target.slug },
    },
    after: {
      experiencesMoved,
      aliasesAdded,
      sourceMergedInto: String(target._id),
    },
    ip: getActorIp(actor),
  });

  return {
    success: true,
    experiencesMoved,
    aliasesAdded,
    message:
      experiencesMoved === 0
        ? "Merge completed: 0 experiences moved (already up to date)."
        : `Successfully merged ${source.name} into ${target.name}. Moved ${experiencesMoved} experience(s) and added ${aliasesAdded} alias(es).`,
  };
}

/**
 * Retrieves active companies and aliases for datalists/filters
 * (active companies with >= 1 published or featured experience)
 * @returns {Promise<Array<{ _id: any, name: string, isAlias?: boolean }>>}
 */
async function getDatalistCompanies() {
  const Blog = require("../models/blog");
  const activeCompanyIds = await Blog.distinct("experience.company", {
    type: "experience",
    status: { $in: ["published", "featured"] },
  });
  const companies = await Company.find({
    _id: { $in: activeCompanyIds },
    mergedInto: null,
  })
    .select("name aliases")
    .sort({ name: 1 })
    .lean();

  const result = [];
  const seen = new Set();

  for (const c of companies) {
    const k = c.name.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      result.push({ _id: c._id, name: c.name });
    }
    if (Array.isArray(c.aliases)) {
      for (const a of c.aliases) {
        if (a) {
          const ak = a.toLowerCase();
          if (!seen.has(ak)) {
            seen.add(ak);
            result.push({ _id: c._id, name: a, isAlias: true });
          }
        }
      }
    }
  }
  return result;
}

module.exports = {
  validateCompanyName,
  normalizeKey,
  generateSlug,
  findOrCreateCompany,
  resolveCompanyChain,
  addAlias,
  removeAlias,
  mergeCompanies,
  getDatalistCompanies,
};
