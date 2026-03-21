const Groq = require("groq-sdk");

// Initialize the Groq client with the API key from environment variables
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// The tone prompts remain exactly the same as requested
const TONE_PROMPTS = {
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
 * @param {string} text - The original blog text to rewrite.
 * @param {string} tone - The desired tone for the rewritten text.
 * @returns {Promise<string>} The converted text.
 */
async function convertTone(text, tone) {
  // If the user wants the original text, just return it
  if (tone === "original") return text;

  // Retrieve the system prompt for the selected tone
  const prompt = TONE_PROMPTS[tone];
  if (!prompt) throw new Error(`Unknown tone: ${tone}`);

  // Call the Groq API to generate the rewritten content
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1024,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: text }
    ]
  });

  // Extract and return the generated content from the response
  return response.choices[0].message.content;
}

module.exports = { convertTone };
