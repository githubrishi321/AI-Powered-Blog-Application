const express = require('express');
const router = express.Router();
const { convertTone } = require('../services/ai');

router.post('/tone', async (req, res) => {
    try {
        const { text, tone } = req.body;

        if (!text || text.trim().length < 10) {
            return res.status(400).json({ error: "Text must be at least 10 characters long." });
        }

        if (!tone) {
            return res.status(400).json({ error: "Tone must be provided." });
        }

        const result = await convertTone(text, tone);
        res.json({ result });

    } catch (error) {
        console.error("AI Tone Conversion Error:", error);
        res.status(500).json({ error: "Failed to convert tone. Please try again later." });
    }
});

module.exports = router;
