# Mutfak Sync

Mutfak Ajans için Türkçe, tek yönlü masaüstü yedekleme uygulaması. Tauri 2, Rust, React, TypeScript, SQLite ve paketlenmiş Rclone kullanır. Burak → `Mutfak Ajans/Burak PC`, Naz → `Mutfak Ajans/Naz PC`. Dosya hiyerarşisi ve boş klasörler korunur; yerel kök ikinci kez eklenmez. Yerel silme bulut kopyasını silmez.

**Durum: 0.1.0 geliştirme ön sürümü. Üretime hazır olarak değerlendirmeyin.** Test edilmiş çekirdek ve arayüz mevcuttur. GitHub Actions macOS ARM64 ve Windows x64 için imzasız kurulum artifact'larını başarıyla üretti. Gerçek Google hesabı, macOS/Windows çöp kutusu, otomatik başlatma ve imzalı kurulumlar henüz uçtan uca doğrulanmadı. Tam liste: [Doğrulama ve sınırlar](docs/VALIDATION.md).

## Geliştirme

Node.js 24 LTS, Rust 1.99.1 (rust-toolchain.toml), C/C++ derleme araçları gerekir. macOS: Xcode Command Line Tools. Windows: Visual Studio Build Tools “Desktop development with C++”, Windows SDK ve WebView2. Linux yalnızca geliştirme/doğrulama içindir; GTK 3, WebKitGTK 4.1, AppIndicator, OpenSSL ve DBus geliştirme paketleri gerekir.

```sh
npm ci
npm run sidecar
npm run desktop
```

Sidecar script'i platform paketini GitHub'ın resmi Rclone 1.76.0 yayınından indirir ve repodaki sabit SHA-256 ile doğrular. Kullanıcının kurulumdan sonra terminal/Rclone kurması gerekmez. Geliştirme için `curl`, macOS/Linux'ta `unzip`, Windows'ta PowerShell gerekir. Rclone kodu MIT lisanslıdır; dağıtımda [upstream lisansını](docs/licenses/rclone-LICENSE.txt) koruyun.

Bulut ortamında doğrulanan kurulum:

```sh
bash scripts/cloud-setup.sh
. /workspace/.apt/env.sh
npm run dev
```

Bu script Debian 13'te imzalı APT paketlerini root yetkisi olmadan `/workspace/.apt/sysroot` altına açar. Sistem dizinlerini değiştirmez. Var olan checkout kullanılır; her bulut görevi zaten izoledir, yeni worktree oluşturmayın. Web görünümü yedekleme yapmaz ve bunu açıkça belirtir. Gerçek dosya işlemleri yalnızca Tauri içinde çalışır.

## İlk kullanıcı kurulumu

1. **Kurulumu başlat** → Burak veya Naz seçin. Bir kullanıcı hedefini yalnızca bir bilgisayarda kullanın. Cihaz UUID'si SQLite'ta kalıcıdır; uzak `.mutfak-device` marker'ı başka cihazı tespit eder.
2. İlk deneme için varsayılan **Mock bulut** seçeneğiyle test klasörü kullanın. Mock dosyalar uygulama veri dizininde tutulur, Google'a aktarılmaz. Mock test kurulumunu gerçek Drive profiline yerinde dönüştürme desteklenmez; ayrı işletim sistemi profiliyle gerçek kurulum yapın.
3. Gerçek Drive için mock seçimini kaldırın; mevcut `Mutfak Ajans` klasörünün paylaşım bağlantısını veya folder ID'sini girin. **Google Drive'a bağlan** sistem tarayıcısında Rclone OAuth akışını başlatır. Google ekranındaki izinleri inceleyip kendiniz onaylayın. Akış iptal edilebilir ve 5 dakika sonra zaman aşımına uğrar.
4. Uygulama mevcut Rclone OAuth istemcisini kullanır; size ait bir OAuth client zorunlu değildir. Bu istemcinin Google tarafından kabul edilmesi gerekir. Reddedilirse izinleri genişletmeye veya tarayıcı güvenliğini kapatmaya çalışmayın; [sorun giderme](docs/OPERATIONS.md) bölümüne bakın.
5. Yerel `~/Mutfak Ajans` / `%USERPROFILE%\Mutfak Ajans` varsayılanını kullanın veya klasör seçin. Mevcut içerik korunur. OneDrive/Dropbox/Google Drive/CloudStorage altında konum seçerseniz uyarı görünür; bağımsız klasör önerilir.
6. Oturum açılışında başlat seçeneği varsayılan olarak sunulur. İlk tarama dosyaları kalıcı kuyruğa alır; dosyalar en az 30 sn kararlı kaldıktan sonra yüklenir.

OAuth için `drive` kapsamı hesap dosyalarına geniş erişim sağlar. `root_folder_id` yalnızca uygulama davranışını sınırlar; token yetkisini daraltmaz. Token frontend'e veya loglara gönderilmez. Keychain/Credential Manager erişimi olmadan gerçek provider kullanılmaz. Kasa kaydının silinmesi bağlantıyı keser; Google hesabınızın Güvenlik → Üçüncü taraf erişimi ekranından Rclone erişimini kaldırabilirsiniz. Ayarlar → Yeniden bağlan aynı hedef klasör için OAuth'u tekrar başlatır. Farklı hedef/profil/kök değişikliği ön sürümde engellidir.

## Günlük kullanım

- Dashboard: doğrulanmış dosya sayısı, manifestteki toplam boyut, kuyruk, son başarı ve gerçek yerel boş alan. Aktarım sırasında Rclone'un sağladığı gerçek hız ve ilerleme görünür; sahte kota/ilerleme gösterilmez.
- Dosyalar: hiyerarşik ve açılıp kapanabilen klasör görünümü, Türkçe arama, durumlar ve geri yükleme.
- Aktivite: zaman damgalı son 100 işlem. Kayıtlar yereldir, son 1000 işlem saklanır.
- Depolama: büyük dosyalar, arşivleme önizlemesi, açık onay ve orijinal yola geri yükleme. Çöp kutusu boşaltılmadan disk alanı boşalmayabilir. Buluttaki PSD'yi düzenlemek için önce yerel diske indirin; uygulama sanal disk/scratch disk değildir.
- Ayarlar: tarama aralığı, hız sınırı (`10M` gibi), isteğe bağlı geliştirici filtreleri, önceki sürümü koruma, autostart, tema, OAuth yeniden bağlantı ve hassas bilgi içermeyen tanılama raporu.
- Pencereyi kapatmak uygulamayı tray'e gizler. Gerçek çıkış tray → Çıkış ile yapılır. Duraklatma mevcut alt süreci kesmez; sonraki aktarımı durdurur.

Kuyruk çökme/yeniden başlatmadan sonra korunur. Açılışta ve her 10 dakikada uzlaştırma, dosya olaylarından 2 sn sonra birleştirilmiş yerel tarama yapılır. Uyku sırasında çalışmaz; uyandıktan sonra işçi devam eder ve geçen aralığa göre tarar. Açılışta çevrimdışıysa 30 sn arayla provider tekrar kurulur. API rate limit/kota/ağ/izin hatalarında dosyalar korunur ve üstel gecikmeyle tekrar denenir. Bu sürüm bu hata türlerini kullanıcıya ayrı sınıflandırmaz.

## Arşivleme güvenliği

Yalnızca kuyruğu boş, checksum/size/Drive ID'si ve yerel kararlılığı doğrulanmış dosya arşivlenir. Önizleme onayı sonrasında denetim tekrarlanır. Yerel dosya geçici bir ada alınır, tekrar hash edilir ve OS çöp kutusuna taşınır. Drive kopyası değişmez. Yanlış/eski hash ile kaldırma reddedilir. Ön sürümde gerçek projelerden önce ayrı test dosyalarıyla platform kabul testleri yapın. Ayrıntılı yarış koşulu sınırları [mimari belgede](docs/ARCHITECTURE.md).

Geri yükleme mevcut yerel dosyanın üzerine yazmaz. Çakışan dosyayı önce kullanıcı başka konuma taşımalıdır. Hard-link desteklemeyen hedef disklerde güvenle hata verir. İsteğe bağlı sürüm arşivi `.mutfak-versions` altına önceki doğrulanmış sürümleri kopyalar; otomatik temizleme yoktur. Son 5 sürüm/30 gün politikası henüz uygulanmamıştır.

## Google One, sahiplik ve Shared Drive

5 TB, kullanıcının belirttiği Google One planıdır; API'den doğrulanmış kota olarak sunulmaz. My Drive'da paylaşılan bir klasöre yüklenen dosyalar genellikle yükleyen hesabın sahipliğinde ve kotasında kalır; klasörü paylaşmak sahipliği otomatik devretmez. Aile depolaması paylaşımı ile dosya paylaşımı farklı kavramlardır. Her iki hesap için yeterli alan/yazma yetkisini doğrulayın.

Google Workspace Shared Drive kuruluş sahipliği, üyelik, team_drive ID'si ve farklı izin davranışları kullanır. Google One My Drive klasörüyle aynı değildir. Bu sürüm yalnızca standart My Drive paylaşılan klasörü için tasarlanmıştır; Shared Drive yapılandırması ve kabul testleri tamamlanmamıştır.

Rclone Drive resumable oturumlarını aynı işlemde yönetir. Uygulama/alt süreç yeniden başlatıldıktan sonra kısmi büyük dosyaya kaldığı byte'tan devam garantisi yoktur; güvenli yeniden yükleme gerekebilir. Kısmi aktarım başarılı sayılmaz. Drive revision'larının süresiz saklandığı varsayılmaz.

## Test ve build

```sh
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
cargo check --manifest-path src-tauri/Cargo.toml --features desktop --locked
# Ayrı terminalde npm run dev çalışırken:
npx playwright test
```

Playwright testi `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` verilmezse `/usr/bin/chromium` kullanır. Diğer sistemlerde değişkeni kurulu Chromium'a ayarlayın. Gerçek Google erişimi testlerde kullanılmaz. Rclone entegrasyon testi paketlenmiş binary ile geçici dizindeki local provider'da gerçek upload/download yapar; önce `npm run sidecar` gerekir.

macOS Apple Silicon'da:

```sh
npm run sidecar -- aarch64-apple-darwin
npm run tauri build -- --features desktop --target aarch64-apple-darwin --bundles app,dmg --ci
```

Windows x64 üzerinde:

```sh
npm run sidecar -- x86_64-pc-windows-msvc
npm run tauri build -- --features desktop --target x86_64-pc-windows-msvc --bundles nsis,msi --ci
```

Çıktılar: `src-tauri/target/<target>/release/bundle/{macos,dmg,nsis,msi}/`. [GitHub Actions](.github/workflows/build.yml) her platformda test, SHA-256 doğrulanmış doğru sidecar ve installer üretimi için tanımlıdır. 12 Kasım 2026 tarihli [başarılı workflow #2](https://github.com/burakyurday/mutfak-drive-yedekleme/actions/runs/43184830587) iki imzasız artifact üretti: `mutfak-sync-aarch64-apple-darwin-unsigned` ve `mutfak-sync-x86_64-pc-windows-msvc-unsigned`. GitHub oturumuyla çalışma sayfasındaki Artifacts bölümünden indirilebilir.

İmzalama sertifikası ayarlanmadığından CI çıktıları **imzasızdır**. macOS dağıtımı için Apple Developer üyeliği, Developer ID Application, codesign ve notarization/stapling gerekir. Windows güvenilir dağıtımı için Authenticode imzası ve SmartScreen itibarı gerekir. OS güvenlik kontrollerini kapatmayın. İmzasız ön sürümü yalnızca doğrulanmış kaynak ve hash ile kontrollü testte kullanın; son kullanıcılara dağıtım için imzalama sürecini tamamlayın.

## Belgeler

- [Mimari ve güvenlik](docs/ARCHITECTURE.md)
- [Test sonuçları, eksikler ve teslim durumu](docs/VALIDATION.md)
- [İşletim ve sorun giderme](docs/OPERATIONS.md)
- Marka varlıkları: `public/brand/mark.svg`, `src/styles/tokens.css`; sonradan ajans logosuyla değiştirilebilir.
