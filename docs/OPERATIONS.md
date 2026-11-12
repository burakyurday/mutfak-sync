# İşletim ve sorun giderme

## Yerel veri

Tauri uygulama veri klasöründe `state.sqlite`, WAL/SHM dosyaları, `instance.lock`, mock-cloud ve isteğe bağlı diagnostics.json bulunur. macOS'ta `~/Library/Application Support/com.mutfakajans.sync`, Windows'ta `%APPDATA%\com.mutfakajans.sync`, Linux'ta `$XDG_DATA_HOME/com.mutfakajans.sync` (veya `~/.local/share`). Kesin konum platform Tauri path resolver'ından alınır.

Yedekleme manifesti cihaz UUID'sini içerir. Veritabanını başka bilgisayara kopyalayarak aynı hedefi eşzamanlı kullanmayın. Profil değişikliği, kök taşıma ve cihaz devri için henüz UI yoktur. Veri silerek devretmeyin; önce tüm kuyruk/doğrulamalar tamamlanmalı, ayrı bir migrasyon geliştirilmelidir.

## Bağlantı

- `DRIVE: Aktarım başarısız`: bağlantı, hesabın yazma izni, depolama alanı ve kota sınırlarını Google'ın arayüzünde kontrol edin. Uygulama güvenli tekrar deneme yapar; ham Rclone loglarını dışa aktarmaz.
- OAuth reddedildi: sistem tarayıcısında iptal etmediğinizi ve Rclone istemcisinin Google tarafından izinli olduğunu kontrol edin. Başka bir hesabın klasörünü kullanıyorsanız paylaşımın yazma izni olmalı. Mevcut Rclone OAuth istemcisi engelleniyorsa size ait Google Cloud OAuth Desktop client kurulumu ayrı geliştirme/yapılandırma gerektirir; mevcut sürüm istemci ID UI'si sunmaz.
- Süresi dolan access token: Rclone config'teki refresh token ile yenilemeyi yönetir; güncel config tekrar OS kasasına yazılır. Refresh token iptal edilmişse Ayarlar → Yeniden bağlan kullanın. Gerçek token yenileme bu oturumda Google üzerinde test edilmemiştir.
- `DEVICE`: başka cihazın marker'ı var. Marker'ı rastgele silmeyin. Doğru kullanıcı hedefini seçin ve cihaz sahipliğini inceleyin.
- `AMBIGUOUS`: aynı isimde birden fazla dosya/klasör veya manifestten farklı file ID var. Uygulama rastgele seçim yapmaz. Google Drive'da dosya kimlikleri incelenmeli; otomatik dedupe/silme yapılmaz.
- OS kasası kullanılamıyor: macOS Keychain veya Windows Credential Manager'ın oturumunuzda açılabildiğini kontrol edin. Linux geliştirmesinde Secret Service oturumu gerekir; mock modu bunu gerektirmez.

## Dosyalar

- Kilitli veya sürekli değişen dosyalar: uygulamayı kapatmadan dosyanın kaydedilmesini bekleyin. Kuyrukta tekrar denenir, doğrulanmış sayılmaz.
- Restore çakışması: mevcut dosya korunur. Kullanıcı mevcut kopyayı başka konuma taşıdıktan sonra yeniden deneyebilir.
- Hard-link hatası: geri yükleme hedef diski hard-link desteklemiyor olabilir. Dosya silinmez. Dosyayı Drive'dan kullanıcı kontrollü ayrı bir konuma indirin.
- Arşivleme sırasında hata: orijinal yola geri taşıma denenir. Aynı anda yeni dosya oluşmuşsa eski veri UUID `.mutfak-part` adıyla kalabilir; bu dosyayı silmeyin. Hem Drive kopyasını hem yerel dosyaları inceleyin. Çöp kutusundaki dosya geçici UUID adıyla görünebilir.
- Uzak dosyayı silmek yerel dosyayı silmez; sonraki bulut denetimi eksik kopyayı yeniden yükler.

## Bulut geliştirici ortamı

Açılışta `. /workspace/.apt/env.sh` ile Rust ve rootless GTK/WebKit kütüphanelerini etkinleştirin. `npm run dev` yalnızca web arayüzüdür; gerçek backup için Tauri gerekir. Gerçek OAuth'u kullanıcı onayı olmadan başlatmayın. Google credential değerlerini chat'e, Git'e veya `.env` dosyasına yazmayın. Paket kurulumunda TLS, APT imza veya sabit checksum kontrolünü devre dışı bırakmayın.

Uygulama işletim sistemi uykusunda yükleme sürdürmez. Uyanınca sıradaki tarama ve kalıcı kuyruk devam eder. Pencere kapandığında süreç tray'de kalır; tamamen kapatmak için Çıkış kullanın. Duraklat mevcut dosyayı tamamlamaya bırakır.
