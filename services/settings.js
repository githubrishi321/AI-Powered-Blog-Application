const Settings = require("../models/settings");

// In-memory settings cache
let cachedSettings = null;
let cacheUpdatedAt = null;
const CACHE_TTL_MS = 60 * 1000; // refresh every 60 seconds

async function getSettings() {
  const now = Date.now();
  if (cachedSettings && cacheUpdatedAt && now - cacheUpdatedAt < CACHE_TTL_MS) {
    return cachedSettings;
  }

  let settings = await Settings.findOne({});
  if (!settings) {
    // Create defaults on first access
    settings = await Settings.create({});
  }
  cachedSettings = settings;
  cacheUpdatedAt = now;
  return settings;
}

function invalidateCache() {
  cachedSettings = null;
  cacheUpdatedAt = null;
}

module.exports = { getSettings, invalidateCache };

