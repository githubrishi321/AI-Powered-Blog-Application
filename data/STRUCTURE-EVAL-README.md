# Interview Structure Evaluation Dataset

This directory contains evaluation datasets used by `npm run eval:structure` to benchmark and assess the accuracy of AI structure extraction from raw student notes.

## Dataset Files

- **`structure-eval.json`**: Checked into git. Contains synthetic example notes marked with `"example": true`.
- **`structure-eval.local.json`**: Ignored by git (`.gitignore`). Contains private, real anonymized candidate interview notes collected with consent.

## Schema per Entry

```json
{
  "example": true,
  "notes": "Raw unstructured text string describing the placement / internship experience...",
  "expected": {
    "company": "Company Name",
    "role": "Job Title / Role",
    "driveType": "on-campus | off-campus | internship | null",
    "year": 2024,
    "roundCount": 2,
    "roundTypes": ["technical", "hr"],
    "outcome": "selected | rejected | waiting | undisclosed | null"
  }
}
```

## Privacy & Safety Rules

1. Never commit real notes or personally identifiable information (PII) to `structure-eval.json`.
2. All entries in `structure-eval.json` must be purely fictional and carry `"example": true`.
3. When running evaluations with any `"example": true` items, the evaluation runner prints:
   `EXAMPLE DATA - NOT REPORTABLE` banners before and after the results table.

