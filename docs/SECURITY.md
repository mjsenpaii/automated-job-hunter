# Security Framework

## Git Exclusions
Private data must NEVER be committed. Ensure `.gitignore` correctly excludes:
- `.env` files
- `*.private.json` (especially candidate profiles and answer banks)
- Logs, database files, and generated outputs

## .env Handling
Use `.env.example` to define required keys without values. `.env` files must stay local.

## OAuth Token Storage
OAuth tokens (e.g., Gmail) must be stored securely and locally, never exposed in logs or UI.

## Log Redaction
All logs must redact sensitive candidate info (PII, emails, phone numbers, API keys).

## Browser Profile Isolation
Automated browser profiles must be isolated to prevent leakage of existing session data.

## Kill Switch & Limits
- **Kill Switch**: `KILL_SWITCH` in `.env` immediately halts all automated outbound applications.
- **Daily Limits**: `DAILY_APPLICATION_LIMIT` caps the number of applications submitted per day to avoid spam.

## Audit Trail Requirements
Every automated action (parsing, applying, emailing) must generate an audit log entry.

## Secret Scanning
It is recommended to run local secret scanning tools (e.g., git-secrets or similar pre-commit hooks) to prevent accidental commits of sensitive data.
