const Groq = require("groq-sdk");

// Initialize the Groq client with the API key from environment variables
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Default tone prompts — can be overridden by DB settings
const DEFAULT_TONE_PROMPTS = {
  professional: `Rewrite the following blog text in a professional 
  and formal tone. Use clear, authoritative language suitable for 
  a business audience. Keep all key information but elevate the 
  vocabulary and structure.
  Return ONLY the rewritten text, nothing else.`,

  casual: `Rewrite the following blog text in a casual, friendly 
  tone. Write like you are talking to a friend — relaxed, 
  conversational, easy to read. Use simple words and a warm voice.
  Return ONLY the rewritten text, nothing else.`,

  social: `Rewrite the following blog text as a social media post. 
  Make it punchy, engaging, and attention-grabbing. 
  Add relevant hashtags at the end. Keep it short and shareable.
  Return ONLY the rewritten text, nothing else.`,

  polite: `Rewrite the following blog text in a polite, respectful, 
  and courteous tone. Be warm, considerate, and thoughtful.
  Return ONLY the rewritten text, nothing else.`,

  emojify: `Rewrite the following blog text and add relevant emojis 
  throughout. Place emojis naturally within sentences where they 
  fit the emotion or topic. Keep the original meaning intact.
  Return ONLY the rewritten text, nothing else.`,
};

/**
 * Converts the tone of the provided blog text using the Groq API.
 * Settings are read from the database (passed in) with safe fallback to defaults.
 *
 * @param {string} text - The original blog text to rewrite.
 * @param {string} tone - The desired tone for the rewritten text.
 * @param {object} settings - Site settings object from DB (optional).
 * @returns {Promise<string>} The converted text.
 */
async function convertTone(text, tone, settings = null) {
  // If the user wants the original text, just return it
  if (tone === "original") return text;

  // Determine system prompt: prefer DB setting, fallback to default
  let prompt = DEFAULT_TONE_PROMPTS[tone];
  if (settings && settings.aiTones) {
    const toneConfig = settings.aiTones instanceof Map
      ? settings.aiTones.get(tone)
      : settings.aiTones[tone];

    if (toneConfig) {
      if (toneConfig.enabled === false) {
        throw new Error(`Tone "${tone}" is currently disabled.`);
      }
      if (toneConfig.systemPrompt && toneConfig.systemPrompt.trim()) {
        prompt = toneConfig.systemPrompt;
      }
    }
  }

  if (!prompt) throw new Error(`Unknown tone: ${tone}`);

  // Use model from settings with fallback
  const model =
    (settings && settings.aiModel) ? settings.aiModel : "llama-3.3-70b-versatile";

  // Call the Groq API to generate the rewritten content
  const response = await groq.chat.completions.create({
    model,
    max_tokens: 1024,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: text },
    ],
  });

  // Extract and return the generated content from the response
  return response.choices[0].message.content;
}

module.exports = { convertTone, DEFAULT_TONE_PROMPTS };
