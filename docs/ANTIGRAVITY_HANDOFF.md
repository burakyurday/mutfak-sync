# Antigravity devir belgesi

Bu belge Mutfak Sync geliştirmesini başka bir AI geliştirme ortamında güvenle sürdürmek için güncel teknik bağlamı taşır. Gizli anahtar veya OAuth token değeri içermez.

## Başlangıç noktası

- Kaynak depo: `https://github.com/burakyurday/mutfak-sync`
- Ana dal: `main`
- Güncel kararlı sürüm: `v0.1.2`
- Devir commit'i: `9733d4f5a8c98dcf8bb041daa201f5cdfe974f37`
- Yayın: `https://github.com/burakyurday/mutfak-sync/releases/tag/v0.1.2`
- İlişkili web/Hub deposu: `https://github.com/burakyurday/mutfakajans-web`

Her çalışmanın başında önce `git pull --ff-only origin main` çalıştırılmalı ve bu belgeyle birlikte `README.md`, `docs/ARCHITECTURE.md`, `docs/VALIDATION.md`, `docs/UPDATES.md` okunmalıdır.

## Ürünün değişmez davranışları

Mutfak Sync, macOS Apple Silicon ve Windows x64 için tek yönlü yerelden Google Drive'a yedekleme uygulamasıdır.

- Burak dosyaları yalnız `Mutfak Ajans/Burak PC`, Naz dosyaları yalnız `Mutfak Ajans/Naz PC` altında tutulur.
- Yerel silme buluttaki kopyayı silmez. Normal yedeklemede `rclone sync`, `purge` veya uzak silme kullanılmaz.
- Arşivleme ancak uzak kimlik, boyut ve checksum doğrulandıktan ve kullanıcı açıkça onayladıktan sonra yerel dosyayı işletim sistemi çöp kutusuna taşır.
- OAuth/rclone config işletim sistemi kimlik kasasında tutulur; token veya secret frontend'e, loga ya da Git'e yazılmaz.
- Dosya sistemi olayları tek başına yeterli değildir; başlangıç/periyodik uzlaştırma, kalıcılık ve dosya kararlılığı kontrolleri korunmalıdır.
- Sembolik bağlantılar/reparse point'ler izlenmez; kök dışına path traversal reddedilir.

## Güncel çalışan durum

- Tauri 2 + Rust motoru, React/TypeScript arayüzü, SQLite kuyruk/manifest ve paketlenmiş Rclone çalışıyor.
- Windows x64 ve M1 Mac üzerinde gerçek kullanıcı kurulumu, Google OAuth bağlantısı ve Drive'a yedekleme kullanıcı tarafından doğrulandı.
- `v0.1.2` ile Rclone, OAuth ve `icacls` alt süreçleri Windows'ta `CREATE_NO_WINDOW` ile çalışır; terminal penceresi yanıp sönmez.
- Yapılandırılmış uygulama başlangıçta ana pencereyi açmaz, sistem tepsisinde/menu bar'da çalışır. İlk kurulum veya başlangıç hatasında pencere gösterilir; kullanıcı tepsiden açabilir.
- Resmî Mutfak Ajans logosu `public/brand/` altında ve platform ikonlarında kullanılır.
- Uygulama Ayarlar ekranında imzalı güncelleme denetleme/indirme/kurma akışı vardır. Başlangıçtan sekiz saniye sonra ve altı saatte bir otomatik kontrol de yapılır.
- Son CI: `Test and package #16` başarılı. `Create desktop release #9` başarılı; Windows ve macOS updater paketleri imzalıdır.

## Mimari sınır: Sync ve Hub

Masaüstü Sync uygulamasına ikinci bir müşteri/veritabanı sistemi eklenmemelidir. Mutfak Hub'ın canlı müşteri alanı `mutfakajans-web` deposunda, Neon PostgreSQL ve Vercel üzerinde geliştirilir. Masaüstü yalnız yapılandırılmış HTTPS Hub adresini açabilir.

Hub hedefi:

- Müşteri Google hesabı olmadan magic link/e-posta oturumuyla yalnız kendi tenant/proje alanını görür.
- Müşteri yükleme yapabilir ve yalnız yayımlanmış önizleme/dosyalarına erişir; başka müşterilerin verisini veya teknik ayrıntıları göremez.
- Mutfak ekibi ilgili müşteri dosyalarının tamamına rol bazlı erişir.
- Büyük indirme Cloud Run benzeri streaming servisinden geçirilir; büyük dosya web sunucusunun belleğine bütünüyle alınmaz.
- Drive/Neon/Vercel servis sırları yalnız sunucu tarafında kalır.

Hub'ın gerçek production Neon/Google/Cloud Run kabul durumu masaüstü Sync'ten ayrı doğrulanmalıdır. Sync deposundaki tarayıcı Hub görünümü üretim veritabanı istemcisi değildir.

## Yerel kurulum

Gereksinimler: Node.js 24, Rust toolchain (`rust-toolchain.toml`), platform Tauri derleme araçları.

```sh
git clone https://github.com/burakyurday/mutfak-sync.git
cd mutfak-sync
npm ci
npm run sidecar
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm run test:e2e
```

UI önizlemesi için `npm run dev`, gerçek masaüstü geliştirme için `npm run desktop` kullanılır. Tarayıcı önizlemesi gerçek yedekleme yapmaz.

## Yayın ve gizli bilgiler

GitHub Actions'ta değerleri depoya alınmayan şu girdiler yapılandırılmıştır:

- `TAURI_SIGNING_PRIVATE_KEY` — GitHub Secret
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — GitHub Secret
- `TAURI_SIGNING_PUBLIC_KEY` — GitHub Variable veya Secret

Değerleri isteme, yazdırma veya başka bir dosyaya kopyalama. Kararlı yayın için:

1. `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` ve `src-tauri/tauri.conf.json` sürümlerini birlikte yükselt.
2. Tüm testleri çalıştır ve ana dala gönder.
3. Yalnız yayın onayı varsa `vX.Y.Z` etiketi oluşturup gönder.
4. `.github/workflows/release.yml` tamamlanmadan yayını başarılı sayma.
5. `releases/latest/download/latest.json` içindeki sürüm, iki platform URL'si ve boş olmayan imzaları doğrula.

İşletim sistemi code signing/notarization ile Tauri updater imzası farklıdır. Updater imzalıdır; Apple Developer ID/notarization ve Windows Authenticode sertifikası henüz yoktur. Güvenlik kontrollerini kapatmayı önerme.

## Test ve güvenlik kapıları

Değişiklikten önce/sonra en az:

```sh
npm test
npm run build
npm run test:e2e
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo clippy --manifest-path src-tauri/Cargo.toml --features desktop --all-targets --locked -- -D warnings
```

Gerçek kullanıcı dosyalarını test için değiştirme veya silme. Mock provider ve geçici klasörler kullan. Google hesabı yetkisini iptal etme, uzak veri silme, production veritabanı migration'ı veya yayın işlemi için açık kullanıcı talebi olmadan dış sistemde değişiklik yapma.

## Bilinen takip işleri

- Gerçek cihazda `v0.1.1 → v0.1.2` uygulama içi güncelleme kabul testi.
- Windows'ta terminal penceresi göstermeden uzun süreli gerçek yedekleme kabul testi.
- Uyku/uyanma, autostart, token yenileme, ağ kopması, büyük dosya ve kota/rate-limit senaryolarının genişletilmiş gerçek cihaz testleri.
- Apple Developer ID/notarization ve Windows Authenticode sertifikaları edinildiğinde işletim sistemi imzalama hattı.
- Hub için gerçek Neon + Google Drive + Cloud Run staging uçtan uca doğrulaması, ayrı `mutfakajans-web` deposunda.

## Antigravity'ye verilecek ilk talimat

> Bu depoda `AGENTS.md` ve `docs/ANTIGRAVITY_HANDOFF.md` dosyalarını tamamen oku. `main` dalını ve mevcut çalışma ağacını kontrol et. Mutfak Sync'in tek yönlü, uzak silme yapmayan güvenlik modelini koru. Her değişiklikten önce ilgili kodu ve testleri incele; değişiklikten sonra frontend ve Rust testlerini çalıştır. Secret değerlerini isteme veya yazdırma. Yayın ya da production dış sistem değişikliği yapmadan önce bunun açıkça talep edildiğini doğrula.

