# Security policy

Mutfak Sync is a development preview. No production support or vulnerability-response SLA is promised.

## Report a vulnerability

Use GitHub's private vulnerability reporting if enabled: https://github.com/burakyurday/mutfak-sync/security/advisories/new. If private reporting is unavailable, contact the maintainer privately before disclosing details. Do not post credentials or sensitive filenames in public issues.

Include the affected version/commit, platform, reproduction steps using synthetic files, impact and a redacted log. Never send OAuth tokens, Drive links, customer data or local personal paths.

## Safe testing

Use a separate test folder and mock provider first. Review [architecture](docs/ARCHITECTURE.md) and [validation](docs/VALIDATION.md). Real Drive access is broad; the selected root does not limit token permissions. Do not bypass OS security checks or rely on unsigned development builds for critical backups.
