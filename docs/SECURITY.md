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

## URL Importer — SSRF Protection
The public job-URL importer (`packages/ingestion/src/adapters/url-extractor.ts`, surfaced via the dashboard `/api/extract` route) fetches untrusted, user-supplied URLs. It enforces server-side SSRF protections. Do **not** weaken these:

- **Scheme allow-list:** only `http:` and `https:` are permitted.
- **Host blocking (by name):** `localhost`, `localhost.localdomain`, `*.localhost`, and `*.local`.
- **IPv4 range blocking:** `0.0.0.0/8`, `10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16` (link-local, incl. the `169.254.169.254` cloud-metadata endpoint), `172.16.0.0/12`, `192.168.0.0/16`, `192.0.0.0/24`, `100.64.0.0/10` (CGNAT), and multicast/reserved/broadcast (`>= 224.0.0.0`).
- **IPv6 range blocking:** `::1` (loopback), `::` (unspecified), `fc00::/7` (unique-local), `fe80::/10` (link-local), `fec0::/10`, `ff00::/8` (multicast), and IPv4-mapped/compatible addresses (classified via their embedded IPv4).
- **DNS-based SSRF:** the hostname is resolved and **every** returned address must be public; if any resolves to a private/reserved range the request is refused.
- **Redirect validation:** redirects are followed **manually**, re-validating scheme, host, and resolved IPs at **every hop** (max 5). Prevents "public URL → internal address" redirect attacks.
- **Request timeout:** each hop has a 10s abort timeout.
- **Response-size cap:** the response body is read with a hard 2 MB limit (stream is cancelled if exceeded).

**Out of scope by design:** no authenticated scraping, no CAPTCHA bypass, and no application submission — the importer only reads public postings.

> Residual note: Node's `fetch` performs its own DNS resolution after our pre-validation, leaving a small TOCTOU window against active DNS-rebinding. Pinning the connection to the validated IP (custom lookup/agent) is a recommended future hardening.
