# Güvenli uygulama güncellemeleri

Mutfak Sync kararlı masaüstü sürümlerini Tauri updater imzasını doğrulayarak indirir. İmzası geçersiz, eksik veya başka bir anahtarla üretilmiş paket kurulmaz. Güncelleme indirildikten sonra aktif aktarımın bitmesi beklenir, yedekleme kuyruğu duraklatılır, paket kurulur ve uygulama yeniden açılır.

## İlk kurulum sınırı

`0.1.0-preview.1` güncelleyici içermediği için bu sürümden otomatik geçiş mümkün değildir. Kullanıcıların güncelleyiciyi içeren ilk sürümü (`0.1.1` veya daha yenisi) bir kez elle kurması gerekir. Bundan sonraki kararlı sürümler uygulama içinden yüklenebilir. `-preview.N` etiketli deneme sürümleri otomatik kanala girmez.

## Yayın anahtarını bir kez oluşturma

Anahtarı yalnız güvenilir, şifreli bir yönetici bilgisayarında oluşturun. Özel anahtarı sohbete, GitHub Variable'a, repoya, build artifact'ına veya tanılama kaydına koymayın.

```sh
npx tauri signer generate -w /guvenli/konum/mutfak-sync-updater.key
```

Güçlü ve benzersiz parolayı bir parola yöneticisinde saklayın. GitHub deposunda şu Actions değerlerini tanımlayın:

- Secret `TAURI_SIGNING_PRIVATE_KEY`: özel anahtar dosyasının eksiksiz içeriği.
- Secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: anahtar parolası.
- Variable `TAURI_SIGNING_PUBLIC_KEY`: komutun ürettiği genel anahtar. Yanlışlıkla aynı adla Secret olarak kaydedilmişse workflow güvenli biçimde onu da kabul eder.

Genel anahtar uygulamaya derleme anında gömülür. Özel anahtar yalnız GitHub Actions release işinde updater paketlerinin `.sig` imzasını üretmek için kullanılır. Özel anahtar kaybolursa mevcut kurulumlara aynı güven zincirinden güncelleme gönderilemez; çevrimdışı, şifreli yedek bulundurun.

## Sürüm yayınlama

1. `package.json`, `src-tauri/Cargo.toml` ve `src-tauri/tauri.conf.json` sürümlerini aynı değere yükseltin.
2. Testleri ve iki platform paketleme işini çalıştırın.
3. Kontrollü test için `vX.Y.Z-preview.N` etiketi oluşturun. Bu bir prerelease olur ve otomatik güncelleme kanalına girmez.
4. Kabul testleri geçince aynı kaynak üzerinde yeni bir sürüm numarasıyla `vX.Y.Z` etiketi oluşturun. Workflow macOS ARM64 ve Windows x64 paketlerini, imzalarını ve `latest.json` dosyasını yayınlar.
5. Uygulamalar açılıştan sekiz saniye sonra, ardından altı saatte bir kararlı kanalı kontrol eder. Ayarlar ekranından elle kontrol de yapılabilir.

Yayınlanmış updater asset'larını veya `latest.json` dosyasını sonradan aynı etikette değiştirmeyin. Sorunlu sürümü geri çekmek yerine daha yüksek numaralı düzeltme sürümü yayınlayın. Otomatik downgrade desteklenmez.

## İki farklı imza

Tauri updater imzası paketin Mutfak Sync tarafından yayımlandığını doğrular. macOS Developer ID/notarization ve Windows Authenticode ise işletim sisteminin yayıncı doğrulamasıdır. Bunlar birbirinin yerine geçmez. Mevcut workflow updater paketlerini imzalar; Apple/Windows sertifikaları sağlanana kadar işletim sistemi kurulum paketleri imzasızdır ve bu durum sürüm notlarında açıkça belirtilir.
