/**
 * Evaluation script for AI-Assisted Interview Note Structuring
 * Usage: npm run eval:structure
 *
 * Rules:
 * - Uses the SAME service functions as the endpoint (redaction, structureInterviewNotes, parseAndSanitizeStructuredOutput)
 * - Processes at most 30 entries
 * - Pauses 2 seconds between calls
 * - Halts and reports on the first API error without retrying
 * - Computes accuracy, hallucination count, and average latency
 * - Never writes numbers or results to any file
 */

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");

const {
  structureInterviewNotes,
  parseAndSanitizeStructuredOutput,
} = require("../services/ai");
const {
  redactContactInfoWithCount,
  findContactInfo,
} = require("../services/experienceInput");
const { getSettings } = require("../services/settings");

// Database safety check
const mongoUrl = process.env.MONGO_URL || "";
const dbNameMatch = mongoUrl.match(/\/([^/?]+)(?:\?|$)/);
const dbName = dbNameMatch ? dbNameMatch[1] : "";
if (!dbName.endsWith("_dev") && !dbName.endsWith("_test")) {
  console.error("REFUSING TO RUN: DB name must end with '_dev' or '_test'");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runEvaluation() {
  await mongoose.connect(mongoUrl);

  try {
    const settings = await getSettings();

    // Prefer local real notes if available, else standard eval dataset
    const localPath = path.join(__dirname, "../data/structure-eval.local.json");
    const standardPath = path.join(__dirname, "../data/structure-eval.json");

    let dataPath = standardPath;
    if (fs.existsSync(localPath)) {
      dataPath = localPath;
      console.log(`Using local evaluation dataset: ${localPath}`);
    } else {
      console.log(`Using standard evaluation dataset: ${standardPath}`);
    }

    const rawData = fs.readFileSync(dataPath, "utf8");
    const allEntries = JSON.parse(rawData);
    const entries = allEntries.slice(0, 30);

    const hasExample = entries.some((e) => e.example === true);

    console.log(`Loaded ${entries.length} evaluation entries to process.\n`);

    const results = [];
    const hallucinations = {
      company: 0,
      role: 0,
      driveType: 0,
      year: 0,
      roundCount: 0,
      outcome: 0,
    };
    const accuracyCounters = {
      company: 0,
      role: 0,
      driveType: 0,
      year: 0,
      roundCount: 0,
      roundTypes: 0,
      outcome: 0,
    };
    const latencies = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      console.log(`[EVAL ${i + 1}/${entries.length}] Processing entry...`);

      // 1. PII detection check & warning
      const piiCheck = findContactInfo(entry.notes);
      if (piiCheck.hasContact) {
        console.warn(
          `  [WARNING] Contact info detected in notes for entry #${i + 1} (${piiCheck.type})`
        );
      }

      // 2. Redact contact details
      const { redactedText, redactedCount } = redactContactInfoWithCount(entry.notes);

      // 3. Invoke real Groq via service
      const startTime = Date.now();
      let rawOutput;
      try {
        rawOutput = await structureInterviewNotes(redactedText, settings);
      } catch (apiErr) {
        console.error(
          `\n[FATAL API ERROR on entry #${i + 1}]: ${apiErr.name || "Error"} - ${apiErr.message}`
        );
        console.error("Halting evaluation immediately without retry.");
        process.exit(1);
      }
      const latencyMs = Date.now() - startTime;
      latencies.push(latencyMs);

      // 4. Whitelist parsing & sanitization
      let parsed;
      try {
        parsed = parseAndSanitizeStructuredOutput(rawOutput, redactedCount, redactedText);
      } catch (parseErr) {
        console.error(
          `\n[PARSE ERROR on entry #${i + 1}]: ${parseErr.message}`
        );
        console.error("Halting evaluation immediately.");
        process.exit(1);
      }

      const actual = parsed.data;
      const expected = entry.expected || {};

      // 5. Accuracy & Hallucination checks
      // Company: trimmed and lowercased
      const actualComp = (actual.company || "").trim().toLowerCase();
      const expComp = (expected.company || "").trim().toLowerCase();
      const compMatch = actualComp === expComp;
      if (compMatch) accuracyCounters.company++;
      if (expected.company === null && actual.company !== null) hallucinations.company++;

      // Role: trimmed, lowercased, or substring containment
      const actualRole = (actual.role || "").trim().toLowerCase();
      const expRole = (expected.role || "").trim().toLowerCase();
      const roleMatch =
        actualRole === expRole ||
        (actualRole && expRole && (actualRole.includes(expRole) || expRole.includes(actualRole)));
      if (roleMatch) accuracyCounters.role++;
      if (expected.role === null && actual.role !== null) hallucinations.role++;

      // DriveType
      const driveMatch = actual.driveType === expected.driveType;
      if (driveMatch) accuracyCounters.driveType++;
      if (expected.driveType === null && actual.driveType !== null) hallucinations.driveType++;

      // Year
      const yearMatch = actual.year === expected.year;
      if (yearMatch) accuracyCounters.year++;
      if (expected.year === null && actual.year !== null) hallucinations.year++;

      // RoundCount exact
      const actualRounds = actual.rounds || [];
      const expRoundCount = expected.roundCount;
      const countMatch = actualRounds.length === expRoundCount;
      if (countMatch) accuracyCounters.roundCount++;
      if (expected.roundCount === 0 && actualRounds.length > 0) hallucinations.roundCount++;

      // RoundTypes: sorted array equality
      const actualTypes = actualRounds.map((r) => r.type).sort();
      const expTypes = (expected.roundTypes || []).slice().sort();
      const typesMatch = JSON.stringify(actualTypes) === JSON.stringify(expTypes);
      if (typesMatch) accuracyCounters.roundTypes++;

      // Outcome
      const outcomeMatch = actual.outcome === expected.outcome;
      if (outcomeMatch) accuracyCounters.outcome++;
      if (expected.outcome === null && actual.outcome !== null) hallucinations.outcome++;

      results.push({
        entry: i + 1,
        company: compMatch ? "OK" : `MISMATCH (${actual.company} vs ${expected.company})`,
        role: roleMatch ? "OK" : `MISMATCH (${actual.role} vs ${expected.role})`,
        driveType: driveMatch ? "OK" : `MISMATCH (${actual.driveType} vs ${expected.driveType})`,
        year: yearMatch ? "OK" : `MISMATCH (${actual.year} vs ${expected.year})`,
        roundCount: countMatch ? "OK" : `MISMATCH (${actualRounds.length} vs ${expRoundCount})`,
        roundTypes: typesMatch ? "OK" : `MISMATCH (${actualTypes.join(",")} vs ${expTypes.join(",")})`,
        outcome: outcomeMatch ? "OK" : `MISMATCH (${actual.outcome} vs ${expected.outcome})`,
        latencyMs,
      });

      // Pause 2 seconds between calls if not last
      if (i < entries.length - 1) {
        await sleep(2000);
      }
    }

    // 6. Print Report
    const total = entries.length;
    const avgLatency = Math.round(
      latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1)
    );

    if (hasExample) {
      console.log("\n==============================================");
      console.log("       EXAMPLE DATA - NOT REPORTABLE          ");
      console.log("==============================================");
    }

    console.log("\nPer-Entry Results:");
    console.table(results);

    console.log("\nSummary Metrics:");
    console.log(`Total Entries Evaluated: ${total}`);
    console.log(`Average Latency: ${avgLatency} ms\n`);

    console.log("Per-Field Accuracy:");
    Object.keys(accuracyCounters).forEach((f) => {
      const pct = ((accuracyCounters[f] / total) * 100).toFixed(1);
      console.log(`  - ${f.padEnd(12)}: ${pct}% (${accuracyCounters[f]}/${total})`);
    });

    console.log("\nHallucination Count (expected null but model returned value):");
    Object.keys(hallucinations).forEach((f) => {
      console.log(`  - ${f.padEnd(12)}: ${hallucinations[f]}`);
    });

    if (hasExample) {
      console.log("\n==============================================");
      console.log("       EXAMPLE DATA - NOT REPORTABLE          ");
      console.log("==============================================\n");
    }
  } finally {
    await mongoose.disconnect();
  }
}

runEvaluation().catch((err) => {
  console.error("FATAL EVALUATION SCRIPT ERROR:", err);
  process.exit(1);
});

