# Mutfak Hub — ürün ve güvenlik mimarisi

Bu belge Supabase bağlantısı yapılmadan hazırlanmış uygulama sözleşmesini tanımlar. Herhangi bir üretim veritabanına migration uygulanmamıştır.

## Teyit edilen davranış

- Müşteri e-posta koduyla giriş yapar; Google hesabı ve Drive arayüzü görmez.
- Müşteri yalnız kendi organizasyonundaki kendi yüklemelerini ve Mutfak ekibinin yayınladığı dosyaları görür ve indirir.
- Müşteri dosya taşıyamaz, yeniden adlandıramaz, silemez, yayınlayamaz veya kullanıcı davet edemez.
- Kullanıcı davetlerini Mutfak ekibi yönetir.
- İç çalışma dosyaları yayınlanana kadar müşteri sorgularına girmez.
- Orijinaller Google Drive'da, küçük önizlemeler süreli önbellekte tutulur.
- İlk pilot mevcut Google One hesabını kullanır. Depolama `OriginalStorage` sözleşmesi arkasında olduğundan daha sonra Workspace'e taşınabilir.

## Güven sınırları

React'ta bir menüyü gizlemek yetkilendirme değildir. Aynı kontroller dört katmanda uygulanmalıdır:

1. Supabase Auth oturumu ve organizasyon üyeliği.
2. PostgreSQL RLS ile `organization_id` izolasyonu.
3. Sunucu API'sinde dosya görünürlüğü ve işlem yetkisi.
4. Drive file ID'nin veritabanındaki organizasyon ve proje kaydıyla eşleşmesi.

Google OAuth refresh tokenı ve Supabase service-role anahtarı yalnız sunucu kasasında bulunur. Tarayıcıya veya masaüstü React paketine eklenmez. İndirmeler kısa süreli, tek dosyaya bağlı bağlantılar üzerinden yapılır.

## Planlanan veri modeli

Mevcut şema okunmadan tablo oluşturulmamalıdır. Supabase erişimi geldiğinde mevcut tablolarla çakışma kontrolünden sonra şu alanlar eşlenir: organizations, organization_members, projects, files, file_versions, published_files, upload_sessions, preview_assets, invitations, activity_logs ve notifications.

Her dosya kaydı en az `organization_id`, `project_id`, `drive_file_id`, `visibility`, `uploaded_by`, `checksum`, `size`, `preview_status` ve zaman alanlarını taşır. Drive klasör adı yetki kaynağı değildir; sabit UUID ve Drive ID kullanılır.

## Önizleme kuyruğu

Dosya tamamlanmadan dönüşüm başlamaz. Desteklenen görsel/PDF/video dosyaları izole iş kuyruğunda düşük çözünürlüklü çıktıya dönüştürülür. PSD/AI gibi formatlarda güvenli dönüştürücü yoksa kapak üretimi başarısız olarak işaretlenir; orijinal bozulmaz. ZIP ve çalıştırılabilir içerik sunucuda açılmaz.

## Mevcut prototipi açma

- Mutfak ekip görünümü: `/?hub=team`
- Müşteri görünümü: `/?hub=customer`

Bu query parametresi yalnız arayüz prototipini seçer ve üretim kimlik doğrulaması değildir. Gerçek sürümde rol yalnız doğrulanmış Supabase oturumundan gelir.
