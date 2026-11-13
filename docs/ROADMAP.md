# Roadmap

## v0.1.0 — Development preview

- [x] Local queue and manifest, mock provider and Rclone adapter
- [x] React desktop UI and local-provider integration tests
- [x] macOS ARM64 / Windows x64 CI packages (unsigned)
- [ ] Real Google OAuth, reconnect and revoked-permission acceptance tests
- [ ] Real macOS/Windows install, tray, autostart, credential store and trash validation
- [ ] Large-file interruption, quota and permission behavior against a controlled Drive account

## Release gate

- [ ] Resolve platform acceptance failures and update validation evidence
- [ ] Signed installers and macOS notarization; verify install/update behavior
- [x] Document updater signature, release checksum, distribution and recovery procedure
- [ ] Publish a versioned prerelease or stable release only when its stated scope is verified

## Future exploration

- Version retention policy and explicit cleanup controls
- Workspace Shared Drive support and acceptance tests
- Clearer quota, network and permission error classification

This is a roadmap, not a promise of delivery dates. See [validation](VALIDATION.md) for current evidence.
