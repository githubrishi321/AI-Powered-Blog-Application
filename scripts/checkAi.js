/**
 * scripts/checkAi.js
 *
 * One tiny real call to Groq using the configured model from DB settings
 * (resolved via RETIRED_MODELS mapping).
 *
 * Outputs:
 * - Model name
 * - finish_reason
 * - latency
 * - whether reply parsed as JSON
 *
 * Exits non-zero on any failure. Never prints the API key.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const mongoose = require("mongoose");
const Settings = require("../models/settings");
const { getGroqClient, resolveModel } = require("../services/ai");

async function checkAi() {
  const mongoUrl = process.env.MONGO_URL || "";
  const dbNameMatch = mongoUrl.match(/\/([^/?]+)(?:\?|$)/);
  const dbName = dbNameMatch ? dbNameMatch[1] : "";

  if (dbName && !dbName.endsWith("_dev") && !dbName.endsWith("_test")) {
    console.error(`Refusing to run against non-dev database: ${dbName}`);
    process.exit(1);
  }

  let dbConnected = false;
  try {
    if (mongoUrl) {
      await mongoose.connect(mongoUrl);
      dbConnected = true;
    }

    let settings = null;
    if (dbConnected) {
      settings = await Settings.findOne({});
    }

    const requestedModel = settings?.aiModel || "openai/gpt-oss-120b";
    const model = resolveModel(requestedModel);

    const groq = getGroqClient();
    const startTime = Date.now();

    const response = await groq.chat.completions.create({
      model,
      reasoning_effort: "low",
      max_completion_tokens: 100,
      response_format: { type: "json_object" },
      messages: [
        { role: "user", content: 'Reply with only this JSON: {"ok": true}' },
      ],
    });

    const latency = Date.now() - startTime;
    const choice = response.choices && response.choices[0];

    if (!choice) {
      console.error("Failure: No choices returned in Groq response.");
      process.exit(1);
    }

    const content = choice.message?.content || "";
    let parsedJson = false;
    try {
      const parsed = JSON.parse(content);
      parsedJson = parsed && parsed.ok === true;
    } catch (e) {
      parsedJson = false;
    }

    console.log(`Model: ${model}`);
    console.log(`Finish Reason: ${choice.finish_reason}`);
    console.log(`Latency: ${latency}ms`);
    console.log(`Parsed as JSON: ${parsedJson}`);

    if (choice.finish_reason !== "stop" || !parsedJson) {
      console.error("Check failed: finish_reason is not 'stop' or response did not parse as expected JSON.");
      process.exit(1);
    }
  } catch (err) {
    console.error(`Check AI Failed [${err.name || "Error"}]: status ${err.status || err.statusCode || 500}`);
    process.exit(1);
  } finally {
    if (dbConnected) {
      await mongoose.disconnect();
    }
  }
}

checkAi()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

