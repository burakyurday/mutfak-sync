# Mimari ve güvenlik sınırları

React 19 / TypeScript → izinli Tauri 2 komutları → Rust Engine → SQLite WAL → CloudProvider → Rclone 1.76.0. Arayüz özel CSS değişkenleriyle tasarlanmıştır; Tailwind bağımlılığı kullanılmaz. Frontend doğrudan dosya sistemi veya shell yetkisine sahip değildir.

`engine.rs`: başlangıç taraması, notify olayları sonrası tarama, 600 sn uzlaştırma, kararlılık kuyruğu, checksum doğrulaması, arşiv/geri yükleme. `database.rs`: sürüm 1 şeması ve transaction'lar. `cloud.rs`: dosya sistemi üzerinde MockCloudProvider ve paketlenmiş Rclone. `security.rs`: yol, link/reparse denetimleri ve 128 KiB akışla MD5 (Drive'ın desteklediği içerik hash'i). `desktop.rs`: IPC, işletim sistemi kasası, tray, tek instance kilidi ve arka plan işçisi.

Dosya yüklenmeden ve yüklendikten sonra boyut/mtime/hash karşılaştırılır. Değişim varsa aynı kayıt yeniden kuyruğa alınır; eski içerik doğrulanmış sayılmaz. Başarısız aktarım 10 sn'den başlayan üstel gecikme, en fazla bir saat ve jitter ile yeniden denenir. Manifest ve kuyruk aynı SQLite transaction'ında güncellenir. Büyük dosyalar belleğe tamamen alınmaz; Rclone Drive chunk boyutu 16 MiB ve tek transfer kullanır.

Upload işlemleri yalnızca `copyto` ve `mkdir` kullanır. `sync`, `purge`, uzak silme ve otomatik sürüm temizliği bulunmaz. Yerel yeniden adlandırma yeni yol olarak yüklenir; eski uzak yol korunur. Uzak kopya eksikse sonraki başarılı bulut denetiminde yeniden kuyruğa alınır. Hedef ID değişmişse otomatik üzerine yazma durur.

Rclone tüm dosya işlemlerinde `Command.args` kullanır. Drive root folder ID OAuth sırasında config'e yazılır, sonra kasada kayıtlı ID ile karşılaştırılır; cihaz yolu yalnızca Burak PC veya Naz PC olabilir. Her yol bileşeninde yinelenen adlar kontrol edilir. Bu kontrol ve aktarım arasında dışarıdan yapılan değişiklikler için atomik Drive kilidi yoktur. Cihaz marker'ı ikinci cihazı tespit eder ama iki yeni cihazın aynı anda ilk kurulumuna karşı atomik kilit değildir. Aynı kullanıcı hedefini tek cihazla kullanın.

OAuth token config'i macOS Keychain / Windows Credential Manager'a kaydedilir. Rclone çalışırken UUID adlı geçici dosyada materialize edilir, Unix'te 0600, Windows'ta yalnızca geçerli kullanıcı/SYSTEM ACL'si kullanılır. İşlem sonrası token yenilemeleri tekrar kasaya yazılır ve geçici dosya kaldırılır. Ani kapanışta kalmış session/oauth config'leri sonraki açılışta temizlenir. OS kasasına erişim başarısızsa gerçek provider başlatılmaz. Token, rclone stderr veya OAuth URL'leri frontend'e/loglara gönderilmez. OAuth iptal düğmesi veya 5 dakika timeout alt süreci sonlandırır.

`root_folder_id` uygulama davranışını sınırlar; geniş `drive` OAuth iznini daraltmaz. İşletim sistemi kullanıcı hesabı veya başka bir uygulama token'ı ele geçirirse hesaptaki diğer dosyalara erişim riski vardır. CSP uzak kod yüklemesini engeller; uygulamaya web içeriği eklemeyin.

Arşivleme: önizleme → açık onay → tekrar hash/ID/boyut denetimi → aynı dizinde benzersiz geçici ada taşıma → tekrar doğrulama → OS çöp kutusu. Hata halinde orijinal yol boşsa geri taşınır; eşzamanlı yeni dosya varsa geçici adla korunur. Arşivlenirken başka uygulamanın açık dosya tanıtıcısıyla yazmasını tüm platformlarda atomik engelleme henüz doğrulanmamıştır. Gerçek proje dosyalarında kullanmadan önce macOS/Windows kabul testi gerekir. Çöp kutusundaki ad geçici UUID olabilir. OS çöp kutusunu boşaltmak kullanıcının ayrı kararıdır.

Geri yükleme: uzak hash/ID kontrolü, aynı dizine `.mutfak-part` indirme, checksum kontrolü, atomik ve üzerine yazmayan hard-link, geçici dosya temizleme. Hard-link desteklemeyen dosya sistemlerinde işlem güvenle hata verir. Yerel çakışmayı otomatik silmez.

Sürüm arşivi isteğe bağlıdır; yalnızca önceki doğrulanmış kopyayı `.mutfak-versions` altına kopyalar. Otomatik uzak temizleme yoktur. Son 5 sürüm/30 gün seçimi ve manuel uzak geçmiş yönetimi bu sürümde yoktur. Drive'ın standart revisions saklama garantisi yoktur.
