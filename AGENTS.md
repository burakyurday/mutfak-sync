# Mutfak Sync agent instructions

Before modifying this repository, read `docs/ANTIGRAVITY_HANDOFF.md`, `docs/ARCHITECTURE.md`, `docs/VALIDATION.md` and `docs/UPDATES.md`.

- Preserve the one-way backup guarantee: local deletion must never delete the Drive copy.
- Never use destructive Rclone operations for normal backup.
- Keep OAuth tokens, updater private keys and infrastructure secrets out of source, logs and frontend code.
- Use mock providers and temporary directories for automated tests; never mutate real user files.
- Run the documented frontend and Rust quality gates before publishing.
- Do not publish, revoke OAuth access, delete remote data or mutate production infrastructure unless the user explicitly requests that action.
- Treat `mutfakajans-web` as the source of truth for the Neon/Vercel customer Hub. Do not add a second customer database to the desktop app.
