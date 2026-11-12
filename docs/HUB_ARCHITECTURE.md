# Mutfak Hub — ürün ve güvenlik mimarisi

Bu belge Hub uygulama sözleşmesini tanımlar. Migration izole PostgreSQL 15 üzerinde uygulanmış ve RLS kabul testleri geçmiştir; herhangi bir üretim Supabase projesine uygulanmamıştır.

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

## Veri modeli

Migration `supabase/migrations/202611120001_hub_core.sql` dosyasındadır. Mevcut şema okunmadan üretime uygulanmamalıdır. Tablolar Mutfak Web ile çakışmayı azaltmak için `hub_` öneki kullanır: profiles, team_members, organizations, organization_members, projects, files, file_versions, upload_sessions, preview_jobs, invitations ve activity_logs.

Her dosya kaydı en az `organization_id`, `project_id`, `drive_file_id`, `visibility`, `uploaded_by`, `checksum`, `size`, `preview_status` ve zaman alanlarını taşır. Drive klasör adı yetki kaynağı değildir; sabit UUID ve Drive ID kullanılır.

## Önizleme

Dosya tamamlanmadan önizleme açılmaz. Edge Function, Google Drive'ın ürettiği kısa ömürlü thumbnail'i yetki kontrolünden sonra proxy eder; müşteri Drive bağlantısını görmez. Drive thumbnail desteği olmayan PSD/AI/ZIP dosyaları için `hub_preview_jobs` kuyruğu hazırdır fakat izole dönüşüm worker'ı henüz deploy edilmemiştir. ZIP ve çalıştırılabilir içerik sunucuda açılmaz.

## Mevcut prototipi açma

- Mutfak ekip görünümü: `/?hub=team`
- Müşteri görünümü: `/?hub=customer`
- Supabase bağlı canlı görünüm: `/?hub=live`

Bu query parametresi yalnız arayüz prototipini seçer ve üretim kimlik doğrulaması değildir. Gerçek sürümde rol yalnız doğrulanmış Supabase oturumundan gelir.
