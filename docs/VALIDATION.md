# Doğrulama ve teslim durumu

12 Kasım 2026 · Debian 13 x86_64 bulut ortamı · Node 24.22.1 · Rust 1.99.1 · Rclone 1.76.0.

## Çalıştırılmış kontroller

| Kontrol | Sonuç |
|---|---|
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | 24 backup entegrasyon testi + 1 gerçek Rclone local-provider testi geçti. 0 başarısız. |
| `npm test` | 3 Vitest testi geçti. |
| `npm run test:e2e` | 5 Chromium/Playwright testi geçti. Sync akışları ve masaüstünün ikinci veritabanına bağlanmadığı Hub geçişi kapsanıyor. Gerçek dış servis testi değildir. |
| `npm run build` | TypeScript ve Vite üretim derlemesi geçti. Sync paketi ikinci bir veritabanı istemcisi içermiyor. |
| Web Hub testleri | Neon tabanlı Hub'ın oturum, dosya görünürlüğü, bilet ve yükleme sınırları `mutfakajans-web` deposunda test edilir. |
| `cargo check … --features desktop --locked` | Tauri, tray, autostart, keyring ve backend derleme kontrolü geçti. |
| `cargo clippy … --features desktop --all-targets --locked -- -D warnings` | Uyarısız geçti. |
| `cargo build … --features desktop --locked` | Linux geliştirme binary'si üretildi. macOS/Windows installer değildir. |
| `npm audit --omit=dev --audit-level=high` | Üretim bağımlılıklarında 0 bilinen açık raporlandı; tam güvenlik denetimi değildir. |
| `bash scripts/cloud-setup.sh` | Baştan sona tekrar çalıştırıldı, kurulum/sidecar/build/test/desktop check geçti. |
| ARM64 macOS ve x64 Windows Rclone sidecar | Resmi paketler indirildi ve sabit SHA-256 değerleriyle doğrulandı. Yabancı mimaride çalıştırılmadı. |
| GitHub Actions workflow #2 | Başarılı. macOS 15 ARM64 ve Windows 2022 x64 üzerinde testler, Tauri paketleme ve artifact yükleme geçti. macOS artifact 67,5 MB; Windows artifact 55,5 MB. |
| Native Linux grafik açılışı | **Başarısız / ortam engeli:** WebKit yardımcı süreci sabit `/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitNetworkProcess` yolunda yok. Rootless sysroot derlemeyi sağlar, bu yolu sağlamaz. `sudo` yok; bwrap namespace kurulumu da desteklenmiyor. Güvenlik kapatılmadı. |

Kaynaklar: `src-tauri/tests/backup.rs`, `src-tauri/tests/rclone_local.rs`, `src/types.test.ts`, `tests/ui.spec.ts`. Testler yalnızca geçici dosyaları kullanır. Onaylı arşivleme Linux'ta ayrı alt süreç ve izole `XDG_DATA_HOME` çöp kutusu ile test edildi. Kullanıcı dosyası silinmedi/değiştirilmedi.

Ekran görüntüleri: `artifacts/dashboard.png`, `artifacts/dashboard-dark.png`. Bunlar gerçek React arayüzünün tarayıcı görünümüdür; sahte dolu hesap ekranı veya native macOS/Windows ekran görüntüsü değildir.

## Mutfak Hub doğrulaması

- E-posta magic link oturumu, müşteri/proje sınırı, kontrollü yayınlama, resumable yükleme, kısa ömürlü indirme ve Drive thumbnail proxy kodu web deposunda mevcut.
- Desktop paketi Neon, veritabanı veya Google sunucu secret'ı içermez; yalnız yapılandırılmış HTTPS Hub adresini açar.
- Neon tabanlı web Hub testleri müşterinin yalnız kendi yüklemesini ve yayımlanan dosyayı okuyabildiğini doğrular.
- Müşterinin doğrudan dosya manifesti yazma izni yoktur; kayıt yalnız Drive yüklemesi boyut, parent, isim, MIME ve checksum bilgileri doğrulandıktan sonra `READY` olur.
- Gerçek Neon staging ve Google Drive hesabıyla uçtan uca test yapılmadı. OAuth secret'ı, e-posta gönderimi, CORS resumable upload ve büyük Range indirme gerçek ortamda doğrulanmadan Hub üretime hazır sayılmaz.

## Zorunlu kabul senaryoları

| # | Senaryo | Kanıt / kapsam |
|---|---|---|
| 1–3 | Burak/Naz hedef ayrımı, aynı isim çakışmaması | Mock ile otomatik test geçti. |
| 4–6 | İç içe yol, boş klasör, Unicode/Türkçe | Mock testleri + gerçek Rclone local-provider roundtrip geçti. |
| 7–8 | PSD değişikliği ve değişmeyen dosyanın atlanması | Mock testleri geçti; aynı uzak kimlik korunuyor. |
| 9–10 | Kesinti kuyruğu, uygulama kapalıyken eklenen dosya | Mock çevrimdışı ve DB yeniden açma testleri geçti. |
| 11–12 | Yerel/bulut silmesinde diğer kopyanın korunması | Mock testleri geçti; eksik uzak kopya yeniden yükleniyor. |
| 13–14 | Bekleyen veya değişmiş dosyanın arşivlenememesi | Mock + gerçek yerel dosya/hash kontrolleri geçti. |
| 15 | Orijinal konuma geri yükleme | Mock ve izole Linux OS çöp kutusu akışı geçti; üzerine yazma reddediliyor. |
| 16 | Gerçek Google OAuth token süresi dolması/yenileme | **Çalıştırılmadı.** Rclone yenilemesi ve kasa kalıcılığı kodu mevcut; gerçek kullanıcı yetkilendirmesi gerekli. |
| 17 | İzin kaldırıldığında veri silmeden durma | Mock denied testi geçti. Gerçek Google hesabında izin kaldırma yapılmadı. |
| 18 | Yeniden başlatmada kuyruk | SQLite yeniden açma testleri geçti. |
| 19 | Yüklerken Photoshop yeniden kaydetmesi | Upload ortasında dosyayı değiştiren provider testi geçti; en güncel sürüm sonunda doğrulanıyor. Gerçek Photoshop uygulaması çalıştırılmadı. |
| 20 | Aynı isimde birden fazla Drive dosyası | Mock belirsizlik testi geçti; Rclone adapter'ı tüm yol bileşenlerinde birden fazla isim eşleşmesini reddeder. Gerçek Drive üzerinde çift kayıt oluşturulmadı. |

Ek testler: path traversal, sembolik bağlantı, açık arşiv onayı, ikinci cihaz marker'ı, eski doğrulanmış sürümün korunması, opsiyonel filtreyi açıp kapatma, arayüzde arşiv önizleme/iptal/onay, tema ve katlanabilir klasör görünümü. Windows kilitli dosya testi yazıldı; Linux'ta `cfg(windows)` nedeniyle derlenip çalışmadı. CI Windows koşusunda çalışmalıdır.

## Hazır olanlar

- Türkçe altı ana ekran, altı adımlı kurulum, açık/koyu/sistem teması, marka varlıkları, arama ve dosya ağacı.
- SQLite şeması ve kalıcı transaction'lı kuyruk/manifest, notify, debounce, 30 sn kararlılık, 10 dk uzlaştırma.
- Mock ve gerçek Rclone provider; güvenli argümanlar; copy/mkdir; boyut/MD5/ID doğrulaması; retry/backoff/jitter; dosya akışı; ayrı WAL okumasıyla bloklanmayan durum görüntüsü.
- Manuel ve açık onaylı arşivleme, tekrar doğrulama, OS çöp kutusu entegrasyonu, çakışmasız geri yükleme. Linux testleri var; macOS/Windows davranışı doğrulanmalı.
- Keychain/Credential Manager entegrasyonu, geçici private config, OAuth iptal/timeout/yeniden bağlantı kodu. Gerçek Google akışı henüz test edilmedi.
- Tray menüsü, pencere kapanınca gizleme, autostart plugin'i, tek instance kilidi, ayarlar ve güvenli tanılama.
- Doğru mimari sidecar indirme script'i, kilit dosyaları, macOS ARM64/Windows x64 build matrix, kurulum ve güvenlik belgeleri.

## Eksikler ve teknik sınırlar

- GitHub Actions [workflow #2](https://github.com/burakyurday/mutfak-drive-yedekleme/actions/runs/43184830587) `.app`/`.dmg` ve `.exe`/`.msi` içeren imzasız artifact'ları üretti. Paketler henüz gerçek M1 Mac ve Windows bilgisayarına kurulup açılmadı; tray/autostart, OS kasası, Google OAuth ve çöp kutusu kabul testleri gerekir. Bunlar geçmeden dağıtıma hazır denemez.
- Gerçek Google OAuth, token yenileme, büyük dosyada ağ kopması, kota/rate-limit/permission ve Shared Drive kabul testleri çalıştırılmadı. Hatalar şu anda güvenli genel mesajla gösterilir, ayrı hata sınıflandırması yoktur.
- Code signing/notarization yoktur; CI tanımı imzasız artifact üretmek içindir. Güvenlik kontrollerini kapatma talimatı yoktur.
- Manuel `release.yml` iş akışı açık imzasız-sürüm onayı ister, her platform ZIP'i için SHA-256 üretir ve yalnız prerelease oluşturur. Gerçek release çalıştırılmadı.
- Profil, kök ve hedef değişikliği/migrasyonu engellidir. Aynı klasöre yeniden OAuth yapılabilir; uygulama içi hesap bağlantısını tamamen kaldırma ekranı yoktur. Google izin ekranından erişim iptal edilebilir.
- Sürüm arşivi çalışır; son 5 sürüm/30 gün politikası, geçmiş sürümleri UI'da listeleme/geri yükleme ve manuel uzak geçmiş yönetimi yoktur. Otomatik uzak temizleme yapılmaz.
- Bildirimler, özel kullanıcı filtreleri ve eşzamanlı aktarım sayısı ayarı yoktur; güvenilir ve düşük bellekli tek aktarım kullanılır. Tray simgesi durum animasyonu yoktur.
- Tam uzak envanter her dosya/üst yol için Rclone metadata sorgular; çok büyük ağaçlarda periyodik bulut denetimi pahalı olabilir. Olay taramaları yalnızca yereldir, fakat tarama yine tüm yerel ağacı gezer. Büyük ajans arşivlerinde performans ölçümü yapılmadı.
- Drive duplicate tespiti ve cihaz marker'ı atomik uzak kilit değildir; dışarıdan eşzamanlı isim/kimlik değişimi veya iki yeni cihazın aynı anda kurulumu ayrı yarış riski taşır.
- Büyük dosya aktarımı süreç yeniden başlatıldıktan sonra byte seviyesinde devam garantisi vermez. Rclone güvenli yeniden yükleyebilir.
- Arşivleme sonrası çöp kutusu adı geçici UUID olabilir. Açık dosyaya başka uygulama tarafından yazılması, çökme pencereleri ve macOS/Windows trash davranışı ek platform kabul testi gerektirir. Geri yükleme hedefi hard-link desteklemelidir.
- Web arayüzü native IPC'nin veya işletim sistemi davranışının yerine geçmez. Linux GUI ortam engeli çözülmüş değildir.

## Ortam taslağı

`install_script` ve `start_skill` kaydedildi. Gerekli Rust aktivasyonu, rootless paketler, npm ci, sidecar, testler, Vite başlatma ve native GUI engeli kayıtlıdır. Rclone resmi GitHub yayınından indirilebildiğinden geçici `downloads.rclone.org` kuralı kaldırıldı; mevcut paket yöneticisi ağ preset'i korundu. Secret/credential eklenmedi. Taslak kaydı yayın değildir; kullanıcı ortam ayarlarından gözden geçirip kaydetmeli ve Publish yapmalıdır. Yeni görevde snapshot geri yükleme doğrulanmadı.
