# Mutfak Hub ve Mutfak Sync sınırı

Mutfak Hub'ın tek canlı veri kaynağı `mutfakajans-web` deposundaki Neon PostgreSQL veritabanıdır. Masaüstü uygulaması ikinci bir müşteri hesabı, proje tablosu veya Supabase bağlantısı oluşturmaz.

## Ürün ayrımı

- **Mutfak Hub:** E-posta magic link ile giriş, müşteri/proje yönetimi, yayınlanan dosyalar, müşteri yüklemeleri, önizleme ve indirme.
- **Mutfak Sync:** Burak ve Naz bilgisayarlarındaki yerel çalışma klasörlerinin Google Drive'a tek yönlü, otomatik ve silmeye karşı korumalı yedeği.
- Masaüstündeki `VITE_MUTFAK_HUB_URL` yalnız herkese açık HTTPS web adresidir. Neon bağlantısı, oturum secret'ı ve Google OAuth kimlik bilgileri masaüstü React paketine girmez.

## Yetki modeli

Hub yetkisinin kaynağı Neon kayıtları ve sunucu oturumudur. Drive klasör adı veya paylaşım bağlantısı yetki kabul edilmez. Müşteri yalnız kendi tenant'ındaki yüklemeleri ve Mutfak ekibinin yayımladığı dosyaları görebilir; iç dosyalar yayımlanana kadar görünmez.

Orijinal büyük dosya indirmeleri kısa ömürlü, dosyaya ve kapsama bağlı biletle Cloud Run üzerinden stream edilir. Vercel çok GB içeriği belleğine almaz. Müşteri Google hesabı, Drive arayüzü veya OAuth ayrıntısı görmez.

## Masaüstü geçişi

`/?hub=live`, yapılandırılmış web Hub adresini açan geçiş ekranıdır. Rol ve dosya görünürlüğü masaüstünde taklit edilmez; bunlar gerçek web oturumundan belirlenir.

Canlı Hub şeması, güvenlik sınırları ve yayın kontrol listesi `mutfakajans-web/docs/MUTFAK_HUB_ARCHITECTURE.md` belgesindedir.
