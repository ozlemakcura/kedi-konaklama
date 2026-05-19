# Kedi Konaklama

Tek sayfalık admin + sahip portalı.

## Özellikler

- Admin e-posta/şifre girişi
- Kedi kayıtları
- Günlük bakım notları
- Sahiplerin özel linkten not göndermesi
- Sahip sayfasında son günlük notlar ve eşya listesi
- Verilerin Supabase üzerinde kalıcı saklanması
- Owner linklerinde admin anahtarı taşınmaması

## Kurulum

1. Supabase projesi oluşturun.
2. Supabase SQL Editor'da `supabase-schema.sql` dosyasının tamamını çalıştırın.
3. Project Settings > API bölümünden:
   - Project URL
   - anon public key
   alın.
4. `config.js` dosyasını şu şekilde doldurun:

```js
window.KEDI_APP_CONFIG = {
  supabaseUrl: "https://PROJE.supabase.co",
  supabaseAnonKey: "ANON_PUBLIC_KEY"
};
```

5. GitHub Pages kullanıyorsanız repo `main` dalı ve `/root` klasöründen yayınlanmalıdır.
6. Siteyi açın, admin hesabı oluşturun, ardından giriş yapın.

## Güvenlik notu

- `anon public key` tarayıcı tarafında kullanılmak üzere tasarlanmıştır.
- `service_role` anahtarını hiçbir zaman `config.js` içine koymayın.
- Tablolarda Row Level Security açıktır.
- Sahip sayfası yalnızca rastgele oluşturulan owner token ile çalışan veritabanı fonksiyonları üzerinden veri alır ve not yollar.

## Dosyalar

- `index.html`: Arayüz ve istemci mantığı
- `config.js`: Supabase yapılandırması
- `supabase-schema.sql`: Tablolar, RLS politikaları ve sahip portalı RPC fonksiyonları
