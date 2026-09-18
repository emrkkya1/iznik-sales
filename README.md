# Tarihi İznik Fırını Satış Uygulaması

Tarihi İznik Fırını için hazırlanmış yatay Android tablet uygulamasıdır. Şube teslimatlarını, iadeleri ve tahsilatları kaydeder; bakiye, ürün ve şube raporları üretir. Yetkili kullanıcılar PDF raporu dışa aktarabilir veya e-posta ile gönderebilir.

## Kimin için?

- **Personel:** Teslimat, iade ve tahsilat girişi yapar; kendi hareketlerini görür.
- **Yönetici:** Şube, ürün ve fiyatları yönetir; bakiye ve raporları inceler.

Ana hedef Android tablettir. Web ve iOS yalnızca geliştirme/test kolaylığı sağlar.

## Yeni kurulum: fork ile başlayın

Yeni bir işletme veya bağımsız kurulum için bu depoyu **fork etmek** en doğru yoldur. Fork, kaynak deponun kendi GitHub hesabınızdaki kopyasıdır. Böylece kendi veritabanınız, anahtarlarınız ve APK yayınlarınız size ait olur; kaynak projeyi etkilemezsiniz.

1. [GitHub](https://github.com/) hesabınızla bu projenin sayfasını açın.
2. Sağ üstten **Fork** düğmesine basın ve kendi hesabınızı seçin.
3. Fork tamamlandığında **Code → HTTPS** adresini kopyalayın.
4. Bilgisayarınızda Terminal veya PowerShell açıp çalıştırın:

```bash
git clone https://github.com/KULLANICI_ADINIZ/DEPO_ADINIZ.git
cd DEPO_ADINIZ
```

Bu rehber, fork sonrası sıfırdan üretim kurulumu içindir. Komutları uygulayacak kişinin bilgisayarda yönetici yetkisi ve GitHub/Supabase hesaplarına erişimi olmalıdır.

## Kullanılan teknoloji

| Araç | Basit açıklama |
|---|---|
| Expo + React Native | Android tablet uygulamasını oluşturur. |
| Supabase | Kullanıcı hesaplarını ve satış verilerini güvenli biçimde barındırır. |
| GitHub | Kodun saklandığı ve ekip çalışmasının yapıldığı yerdir. |
| GitHub Actions | Otomatik test, veritabanı yayını ve APK üretimini yapar. |
| Resend (isteğe bağlı) | Raporların e-posta ile gönderilmesini sağlar. |

## Kurulum haritası

1. GitHub fork oluşturun.
2. Supabase'de boş bir üretim projesi açın.
3. Gerekli değerleri GitHub Secrets ve Variables bölümüne ekleyin.
4. Veritabanı ve sunucu fonksiyonlarını yayınlayın.
5. Sürümü artırıp `main` dalına gönderin.
6. GitHub'ın oluşturduğu APK'yı tabletinize kurun.

Yalnızca geliştirme yapmak isteyenler [Yerel geliştirme](#yerel-geliştirme) bölümüne geçebilir.

## 1. Supabase hesabı ve üretim projesi

Supabase, uygulamanın veritabanı ve giriş sistemi olarak çalışır.

1. [Supabase Dashboard](https://supabase.com/dashboard) hesabı açın veya oturum açın.
2. **New project** seçin.
3. Kurumunuzu, anlaşılır proje adını ve size yakın bölgeyi seçin.
4. Güçlü bir veritabanı parolası oluşturun. Bu parolayı güvenilir parola yöneticinize kaydedin.
5. Proje hazır olduğunda proje adresindeki `https://REF.supabase.co` biçiminde görünen `REF` değerini not edin. Bu değer **Project Ref**'tir.

> Veritabanı parolasını, erişim token'larını ve gizli API anahtarlarını e-posta, sohbet, ekran görüntüsü veya kaynak kod ile paylaşmayın.

### Uygulama bağlantı bilgileri

Supabase projesinde **Connect** ekranını açın. Şunları alın:

- **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
- **Publishable key** (eski projelerde `anon key`) → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## 2. GitHub ayarları

Fork'unuzda **Settings → Environments → New environment** yolundan `production` adlı ortamı oluşturun. İsterseniz yayın öncesi manuel onay kuralı ekleyin.

Sonra **Settings → Secrets and variables → Actions** sayfasını açın.

- **Secrets:** Parola, token ve anahtarlar içindir; değerler sonradan görüntülenemez.
- **Variables:** Gizli olmayan ayarlar içindir.

### APK üretimi için gerekenler

Bunları **repository secret** olarak ekleyin. APK iş akışı `production` ortamını kullanmaz.

| Tür | Ad | Değerin kaynağı |
|---|---|---|
| Secret | `EXPO_PUBLIC_SUPABASE_URL` | Supabase Connect ekranındaki Project URL |
| Secret | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase Connect ekranındaki Publishable/anon key |

### Veritabanını üretime yayınlamak için gerekenler

Bunları `production` ortamında ekleyin.

| Tür | Ad | Nasıl alınır? |
|---|---|---|
| Secret | `SUPABASE_ACCESS_TOKEN` | Supabase Account → Access Tokens bölümünden yeni token oluşturun. Mümkünse yalnızca bu proje için sınırlandırın. |
| Secret | `SUPABASE_DB_PASSWORD` | Proje oluştururken belirlediğiniz veritabanı parolasıdır. Unuttuysanız Supabase Database → Settings ekranından yenileyin. |
| Variable | `SUPABASE_PROJECT_REF` | `https://REF.supabase.co` içindeki `REF` değeridir. |

### E-posta raporları

Bu projedeki mevcut **Deploy production** iş akışı e-posta Function'larını da yayımlar. Bu nedenle üretim yayını çalıştırmadan önce aşağıdaki iki değeri ekleyin. E-posta raporlarını hiç kullanmayacaksanız, önce ilgili iş akışını ve Function'ları teknik bir kişiyle devre dışı bırakın.

1. [Resend](https://resend.com/) hesabı oluşturun.
2. **Domains** bölümünden kendi alan adınızı ekleyin.
3. Resend'in gösterdiği SPF ve DKIM DNS kayıtlarını alan adı sağlayıcınıza girin; doğrulama tamamlanana kadar bekleyin.
4. **API Keys** bölümünden yalnızca gönderme yetkili, mümkünse alan adıyla sınırlı bir anahtar oluşturun.
5. `production` ortamına şu secret'ları ekleyin:

| Ad | Değer |
|---|---|
| `RESEND_API_KEY` | Resend'in bir kez gösterdiği API anahtarı |
| `REPORTS_FROM_EMAIL` | Örnek: `Tarihi İznik Fırını <raporlar@alanadiniz.com>`; doğrulanmış alan adı kullanılmalıdır. |

### İsteğe bağlı bilgiler

`SUPABASE_SERVICE_ROLE_KEY`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_STAFF_EMAIL` ve `BOOTSTRAP_STAFF_PASSWORD` yalnızca ilk uzaktan veri yükleme veya planlı rapor e-postaları için gerekir. Normal APK üretimi ve standart üretim yayını için gerekli değildir.

## 3. Uygulama kimliğini uyarlama

Yeni bağımsız kurulumda `app.json` dosyasındaki şu alanları kendi markanıza göre değiştirin:

- `name` ve `slug`
- `android.package`
- `ios.bundleIdentifier`
- Uygulama simgesi ve açılış görseli

Android paket adı benzersiz olmalıdır; örnek: `com.sirketiniz.satis`. Sonradan değişmesi Android açısından yeni bir uygulama anlamına gelir.

## 4. İlk üretim yayını

GitHub Actions veritabanı şemasını ve e-posta Function'larını yayımlar.

1. GitHub'da **Actions** sekmesini açın.
2. **Deploy production** iş akışını seçin.
3. **Run workflow** düğmesine basın.
4. İşlem başarıyla bittiğinde Supabase'de tablolar, yetkiler ve rapor fonksiyonları kurulmuş olur.

Başlangıç örnek verileri ve ilk kullanıcı hesapları uzaktan yüklenecekse, isteğe bağlı sırları ekledikten sonra **Bootstrap remote** iş akışını manuel çalıştırın. İstenen Project Ref değerini aynen yazın; bu güvenlik kontrolü yanlış veritabanına işlem yapılmasını önler.

## 5. APK oluşturma ve tablete kurma

APK almak için Google Play hesabı gerekmez.

1. `app.json` içindeki `expo.version` değerini artırın: örneğin `1.0.1` → `1.0.2`.
2. Değişikliği `main` dalına gönderin.
3. GitHub → **Actions** → **Build and release APK** iş akışını açın.
4. İş başarıyla tamamlanınca GitHub → **Releases** sayfasında sürüm yayınını açın.
5. `.apk` dosyasını Android tablete indirin.
6. Android uyarı verirse, bu kaynak için uygulama yükleme izni verin ve APK'yı kurun.

Her sürüm numarası yalnızca bir kez yayımlanabilir. Yeni APK için sürümü yeniden artırın.

## Günlük kullanım

1. Uygulamayı tablet üzerinde açın ve size tanımlanmış hesapla giriş yapın.
2. Personel, teslimat/iade/tahsilat bilgilerini kaydeder.
3. Yönetici, şube ve ürün tanımlarını günceller; raporları inceler.
4. İnternet yokken bağlantı uyarısını dikkate alın; finansal kaydın sunucuya ulaştığını varsaymayın.

## Yerel geliştirme

Bu bölüm uygulamayı değiştirecek geliştiriciler içindir.

### Gerekenler

- Node.js 22 veya üzeri
- Git
- Docker Desktop
- Android Studio ve Android SDK (emülatör için)
- Supabase CLI

### Çalıştırma

```bash
npm ci
cp .env.example .env
```

`.env` içindeki Supabase URL ve publishable anahtarını kendi projenizin değerleriyle değiştirin.

```bash
npm run db:start
npm run db:reset
npm start
```

Android emülatörde açmak için terminalde `a` tuşuna basın veya `npm run android` çalıştırın.

### Kalite kontrolleri

```bash
npm run typecheck
npm run lint
npm test
npm run test:db
```

Tüm kontroller için `npm run test:all` kullanılabilir. Yerel test hesapları yalnızca geliştirme içindir; üretimde kullanılmamalıdır.

## Otomatik işler

| İş akışı | Ne zaman? | Görevi |
|---|---|---|
| CI | `main` gönderimi ve pull request | Kod kalitesi, tip ve test kontrolleri |
| Deploy production | `main` gönderimi veya manuel | Veritabanı, Function ve e-posta ayarlarını yayımlar |
| Build and release APK | `main` gönderimi veya manuel | Android APK oluşturur ve GitHub Release'e ekler |
| Scheduled reports | Pazartesi ve ayın ilk günü | Tanımlı raporları e-posta ile yollar |
| Bootstrap remote | Sadece manuel | İlk örnek veri ve hesapları yükler |

## Güvenlik kuralları

- `.env` dosyasını, veritabanı parolasını veya gizli anahtarları Git'e eklemeyin.
- Gizli değerleri yalnızca GitHub Secrets veya güvenilir parola yöneticisinde tutun.
- Service-role anahtarı satır düzeyi güvenliği atlar; mobil uygulamaya asla koymayın.
- Deneme ve üretim için ayrı Supabase projeleri kullanın.
- Bir anahtar sızarsa hizmet panelinden hemen yenileyin ve GitHub Secret değerini güncelleyin.

## Bağlantılar

- [Expo SDK 57 belgeleri](https://docs.expo.dev/versions/v57.0.0/)
- [Supabase belgeleri](https://supabase.com/docs)
- [GitHub Actions belgeleri](https://docs.github.com/actions)
- [Resend belgeleri](https://resend.com/docs)

## Lisans

[LICENSE](LICENSE) dosyasına bakın.
