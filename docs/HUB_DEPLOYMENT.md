# Mutfak Hub kurulumu

Bu işlem gerçek Supabase ve Google Drive sistemlerinde değişiklik yapar. Önce ayrı bir test projesinde doğrulayın. Gerçek anahtarları Git'e, sohbet mesajına veya `VITE_*` değişkenine koymayın.

## 1. Supabase

1. Mevcut Mutfak Web projesinin yedeğini alın ve `supabase/migrations/202611120001_hub_core.sql` dosyasını inceleyin. Tüm tablolar `hub_` öneki kullanır.
2. Migration'ı test ortamına uygulayın. Yerel şema/RLS testi: `npm run test:hub-schema`.
3. Auth e-posta şablonunda tek kullanımlık kod için `{{ .Token }}` kullanın; genel kayıt kapalı kalsın. Kullanıcıları yalnız Mutfak ekibi davet eder.
4. İlk Mutfak kullanıcısını Supabase Auth panelinde oluşturun. Ardından aşağıdaki kayıtları kendi UUID ve adınızla güvenli SQL editöründe ekleyin:

```sql
insert into public.hub_profiles(id,display_name) values ('AUTH_USER_UUID','Burak');
insert into public.hub_team_members(user_id,role) values ('AUTH_USER_UUID','admin');
```

5. `hub-drive` ve `hub-download` Edge Function'larını deploy edin. `hub-download` JWT doğrulaması kapalıdır çünkü erişimi 60 saniyelik HMAC imzalı biletle doğrular; bilet ayrıca her istekte güncel üyelik ve görünürlük kontrolünden geçer.

## 2. Google Drive

Pilot için Mutfak'a ait Google hesabında boş bir `Mutfak Hub` klasörü oluşturun. Folder ID'yi sunucu secret'ı yapın. OAuth refresh token yalnız bu hesabın açık kullanıcı onayıyla alınmalıdır.

Gerekli Edge Function secret'ları `supabase/functions/.secrets.example` içinde listelenmiştir. `HUB_DOWNLOAD_SECRET` en az 32 rastgele byte olmalıdır. Google tokenının geniş Drive izni vardır; root folder ID, OAuth kapsamını daraltmaz. Hesap güvenliği ve iki aşamalı doğrulama zorunlu kabul edilmelidir.

Drive düzeni sunucu tarafından UUID'lerle oluşturulur:

```text
Mutfak Hub/customers/{organization_uuid}/projects/{project_uuid}/incoming
```

Klasör adı yetkilendirme kaynağı değildir. Edge Function klasörleri `appProperties.hub_key` ile doğrular ve belirsiz eşleşmede işlemi durdurur.

## 3. Web uygulaması

`.env.example` dosyasını yerel `.env.local` olarak kopyalayın ve yalnız Supabase URL + anon key ekleyin. Canlı arayüz `/?hub=live` adresindedir. Service-role ve Google secret'ları frontend build ortamına verilmemelidir.

## 4. Kabul kontrolü

- İki ayrı test müşterisi ve bir ekip hesabı oluşturun.
- Müşteri A'nın Müşteri B proje, dosya ve aktivitelerini sorgulayamadığını doğrulayın.
- İç dosyanın yayın öncesi müşteri sorgusuna girmediğini doğrulayın.
- Ağ kesintisinde parça yüklemenin aynı parçayı yeniden denediğini doğrulayın.
- İndirme biletinin 60 saniye sonra reddedildiğini ve üyelik kaldırılınca hemen çalışmadığını doğrulayın.
- Büyük dosya indirme `Range` yanıtını ve tarayıcı devam davranışını doğrulayın.
- Google yetkisini kaldırınca hiçbir verinin silinmediğini doğrulayın.

## Bilinen üretim sınırları

- Google One kişisel hesap ticari müşteri havuzu için uzun vadeli kurumsal sahiplik sağlamaz. Depolama sağlayıcısı daha sonra Workspace/nesne depolamaya taşınmalıdır.
- Google Drive thumbnail desteği olmayan PSD/AI/ZIP dosyalarında otomatik önizleme mümkün olmayabilir. Bu dosyalar için izole dönüşüm worker'ı veya manuel kapak gerekir.
- Resumable yükleme geçici ağ hatalarında parçayı yeniden dener; tarayıcı tamamen kapanırsa mevcut oturum otomatik devam ettirilmez.
- Gerçek Supabase projesi, gerçek Google hesabı ve dış kullanıcı e-postalarıyla uçtan uca test henüz yapılmamıştır.
