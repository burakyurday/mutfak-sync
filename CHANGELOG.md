# Changelog

Changes are documented by version. This file does not imply a GitHub release exists.

## 0.1.0 — Development preview (2026-11-12)

### Added
- Tauri 2 desktop shell and Turkish React interface with light/dark themes.
- One-way folder backup, SQLite queue/manifest, mock provider and bundled Rclone.
- Explicit verified archive/restore flow and OS credential-store integration.
- macOS ARM64 and Windows x64 packaging CI and automated tests.

### Known limitations
- Real Google OAuth, native installation and platform acceptance remain unverified.
- Installers are unsigned; Shared Drive support and automatic version retention are incomplete.

See [validation](docs/VALIDATION.md) and [roadmap](docs/ROADMAP.md).

## Unreleased

- Tauri'nin zorunlu imza doğrulamasını kullanan uygulama içi kararlı sürüm kontrolü, indirme ilerlemesi, güvenli aktarım duraklatma ve yeniden başlatma akışı eklendi.
- macOS ARM64 ve Windows x64 updater paketlerini imzalayan, `latest.json` üreten; preview ve kararlı kanalları ayıran release iş akışı eklendi.
- Yayın anahtarı yönetimi, tek seferlik `0.1.1` bootstrap kurulumu, geri alma ve işletim sistemi imzası sınırları dokümante edildi.
- Repository product presentation, documentation navigation, contribution/security guidance and browser-preview workflow.
- Mutfak Hub'ın canlı müşteri alanı Neon tabanlı web uygulamasında birleştirildi; masaüstündeki eski Supabase veri katmanı kaldırıldı.
- Masaüstüne yalnız yapılandırılmış web Hub adresini açan güvenli portal eklendi; veritabanı ve Google kimlik bilgileri uygulama paketinden çıkarıldı.
- Açık onay gerektiren manuel, imzasız macOS ARM64 ve Windows x64 prerelease workflow'u ile SHA-256 çıktıları eklendi.
