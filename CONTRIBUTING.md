# Contributing

Thanks for helping improve Mutfak Sync. This project is in development preview.

## Development

Use Node.js 24 and the pinned Rust toolchain. Follow [the setup guide](docs/USER_GUIDE.md) and use mock/test data. Keep changes focused; do not include credentials, local paths, customer files or generated installers.

Before opening a pull request:

- Run `npm test`, `npm run build` and relevant Rust tests.
- Run browser tests for UI changes (`npm run test:e2e`).
- For backup/archive changes, include tests for failed verification, retries and no unintended deletion.
- Update documentation and validation notes if behavior or assumptions change.

For security issues, follow [SECURITY.md](SECURITY.md). For ordinary bugs, use the issue template and redact personal data.
