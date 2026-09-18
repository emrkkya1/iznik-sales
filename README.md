# Tarihi İznik Fırını Satış Uygulaması

Bu uygulama, fırının şubelere yaptığı teslimatları, iadeleri, tahsilatları ve bakiyeleri Android tablet üzerinden takip etmesi içindir. Personel günlük hareketleri kaydeder; yönetici şube, ürün, fiyat ve raporları yönetir.

Bu sayfa, teknik bilgisi sınırlı bir kişinin yeni bir işletme kurulumu yapabilmesi için sırayla yazılmıştır. Adımları atlamayın ve gizli değerleri yalnızca parola yöneticinizde veya GitHub Secrets bölümünde saklayın.

## Başlamadan önce

Şunlara ihtiyacınız var:

- GitHub hesabı: Kod ve otomatik işlemler burada bulunur.
- Supabase hesabı: Uygulamanın veritabanı ve kullanıcı hesapları burada bulunur.
- Bir bilgisayar ve internet bağlantısı.
- İlk kullanıcıları belirlemek için iki e-posta adresi ve iki güçlü parola: bir yönetici, bir personel.

E-posta ile rapor gönderimi ve APK bağlantısını e-posta ile paylaşmak bu ilk kurulum için zorunlu değildir. Bunları en son, alan adı doğrulandıktan sonra açabilirsiniz.

> Önemli: Parola, token veya API anahtarını sohbet, e-posta, WhatsApp, ekran görüntüsü ya da GitHub kod dosyasında paylaşmayın. Bunları yalnızca GitHub'ın **Secrets** alanına girin.

## Bu depodaki beş otomasyon ne işe yarar?

GitHub Actions sayfasında beş satır görmek normaldir. Her biri ayrı bir işi güvenli biçimde yapar.

| İş akışı | Ne zaman çalışır? | Sizin yapmanız gereken |
|---|---|---|
| **CI** | `main`e kod gönderilince ve pull request açılınca | Hata varsa düzeltin. |
| **Deploy production** | `main`e kod gönderilince veya elle | Supabase veritabanını ve sunucu fonksiyonlarını günceller. |
| **Build and release APK** | `main`e kod gönderilince veya elle | Android APK oluşturur ve GitHub Releases sayfasına koyar. |
| **Bootstrap remote** | Yalnızca elle | İlk yönetici/personel hesaplarını oluşturur. İlk kurulumda bir kez kullanılır. |
| **Scheduled reports** | Haftalık ve aylık zamanlarda | E-posta raporlarını gönderir. E-posta kurulana kadar atlanır. |

`CI`, `Deploy production` ve `Build and release APK` aynı `main` gönderiminde paralel başlayabilir. Deploy kendi testlerini de çalıştırdığı için veritabanına hatalı değişiklik göndermeden önce kontrol yapar. APK işi ise Supabase e-posta ayarlarına bağlı değildir.

## Sıfırdan kurulum

### 1. Depoyu kendi hesabınıza kopyalayın

1. GitHub'da bu projenin sayfasını açın.
2. Sağ üstteki **Fork** düğmesine basın.
3. Kendi GitHub hesabınızı seçin ve **Create fork** deyin.
4. Bundan sonra kurulum boyunca kendi fork'unuzdaki sayfaları kullanın.

Fork, projenin kendi hesabınızdaki bağımsız kopyasıdır. Kendi Supabase projeniz, gizli anahtarlarınız ve APK yayınlarınız yalnızca bu kopyaya ait olur.

### 2. Supabase'de boş proje oluşturun

1. [Supabase Dashboard](https://supabase.com/dashboard) açın ve giriş yapın.
2. **New project** düğmesine basın.
3. Kuruluşunuzu seçin, projeye anlaşılır bir ad verin ve size yakın bir bölge seçin.
4. Güçlü bir **Database Password** oluşturun. Bu parolayı parola yöneticinize kaydedin; birazdan GitHub'a ekleyeceksiniz.
5. Proje hazır olana kadar bekleyin.

Supabase projenizin adresi `https://xxxxxxxxxxxxxxxxxxxx.supabase.co` biçimindedir. Ortadaki harf-rakam grubu sizin **Project Ref** değerinizdir.

### 3. Supabase'den gerekli bilgileri toplayın

Tarayıcıda Supabase projeniz açıkken aşağıdaki değerleri bulun. Henüz hiçbirini kaynak koda yapıştırmayın.

| GitHub'da kullanılacak ad | Nereden alınır? | Not |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | **Connect** ekranındaki Project URL | Uygulamanın bağlanacağı adres. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | **Connect** ekranındaki Publishable key; eski projelerde anon key | Mobil uygulama bağlantı anahtarı. |
| `SUPABASE_PROJECT_REF` | Proje URL'sindeki `https://REF.supabase.co` içindeki `REF` | Gizli değildir. |
| `SUPABASE_DB_PASSWORD` | 2. adımda oluşturduğunuz Database Password | Gizlidir. |
| `SUPABASE_ACCESS_TOKEN` | Supabase hesabı → **Access Tokens** → **Generate new token** | Gizlidir; tokenı yalnızca bir kez görebilirsiniz. |
| `SUPABASE_SERVICE_ROLE_KEY` | Proje → **Settings** → **API** → service role / secret key | Gizlidir; yalnızca ilk kullanıcıları oluşturmak ve zamanlanmış raporlar için kullanılır. |

### 4. GitHub'da korumalı üretim ortamını oluşturun

1. Fork'unuzda **Settings** → **Environments** bölümünü açın.
2. **New environment** düğmesine basın.
3. Ad olarak tam biçimde `production` yazın ve oluşturun.
4. İsterseniz burada yayından önce onay isteyecek bir kural ekleyin. İlk kurulumda zorunlu değildir.

Bu ortam, canlı Supabase projesine yapılacak işlemleri ayırmak içindir.

### 5. GitHub Secrets ve Variables değerlerini girin

Fork'unuzda **Settings** → **Secrets and variables** → **Actions** sayfasını açın.

Bu rehberdeki tüm değerleri **Repository secrets** veya **Repository variables** olarak ekleyin. Böylece hem APK işi hem de Supabase deploy işi aynı değerleri güvenle kullanabilir.

#### 5A. Önce zorunlu secrets değerlerini ekleyin

**Secrets** sekmesine girin. Her satır için **New repository secret** düğmesine basın, adı aynen yazın ve ilgili değeri girin.

| Secret adı | Değer |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | 3. adımdaki Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | 3. adımdaki Publishable/anon key |
| `SUPABASE_ACCESS_TOKEN` | 3. adımdaki Access Token |
| `SUPABASE_DB_PASSWORD` | Supabase projesinin Database Password değeri |
| `SUPABASE_SERVICE_ROLE_KEY` | 3. adımdaki service-role/secret key |
| `BOOTSTRAP_ADMIN_EMAIL` | İlk yöneticinin e-posta adresi |
| `BOOTSTRAP_ADMIN_PASSWORD` | İlk yönetici için güçlü parola |
| `BOOTSTRAP_STAFF_EMAIL` | İlk personelin e-posta adresi |
| `BOOTSTRAP_STAFF_PASSWORD` | İlk personel için güçlü parola |

#### 5B. Zorunlu variable değerini ekleyin

**Variables** sekmesine girin ve aşağıdaki değeri ekleyin:

| Variable adı | Değer |
|---|---|
| `SUPABASE_PROJECT_REF` | 3. adımdaki Project Ref |

İlk kurulum için başka variable eklemeyin. Özellikle e-posta ile ilgili `true` değerlerini henüz eklemeyin.

### 6. Veritabanını canlı Supabase projenize kurun

1. GitHub'da fork'unuzun **Actions** sekmesini açın.
2. Soldan **Deploy production** iş akışını seçin.
3. **Run workflow** → **Run workflow** düğmesine basın.
4. İşlem bitene kadar bekleyin. Yeşil onay işareti görmeniz gerekir.

Bu işlem tabloları, güvenlik kurallarını ve uygulamanın kullandığı Supabase Function'larını kurar. E-posta ayarları yapılmadıysa e-posta kısmı bilinçli olarak atlanır; bu bir hata değildir.

### 7. İlk yönetici ve personel hesabını oluşturun

1. GitHub **Actions** sayfasında **Bootstrap remote** iş akışını seçin.
2. **Run workflow** düğmesine basın.
3. `profile` alanını değiştirmeyin.
4. `confirm_project_ref` alanına 3. adımda not ettiğiniz Project Ref değerini eksiksiz yazın.
5. **Run workflow** düğmesine basın ve yeşil onayı bekleyin.

Bu işlem 5A adımında girdiğiniz yönetici ve personel hesaplarını oluşturur. Ayrıca 16 temel ürünü, 8 şehirdeki 82 şubeyi, tüm ürün-şube eşleşmelerini ve başlangıç fiyatlarını ekler. Açılış bakiyeleri sıfırdır; teslimat, iade, tahsilat veya demo finansal hareket eklenmez.

### 8. İlk APK'yı oluşturun ve tablete kurun

1. GitHub **Actions** sayfasında **Build and release APK** iş akışını seçin.
2. **Run workflow** → **Run workflow** düğmesine basın.
3. İşlem tamamlanınca GitHub'da **Releases** bölümünü açın.
4. En yeni sürümdeki `iznik-firini-release-v...apk` dosyasını Android tablete indirin.
5. Android izin sorarsa bu tarayıcı/dosya yöneticisi için uygulama yükleme izni verin.
6. APK'yı açıp kurun; ardından 7. adımda oluşturduğunuz yönetici hesabıyla giriş yapın.

APK oluşturmak için Resend, alan adı veya e-posta ayarları gerekmez.

### 9. Sonraki güncellemelerde APK çıkarma

Yeni özellik veya hata düzeltmesi içeren her APK için `app.json` dosyasında iki sayıyı artırın:

- `expo.version`: örneğin `1.0.2` → `1.0.3`
- `android.versionCode`: örneğin `2` → `3`

Sonra değişikliği `main` dalına gönderin. Yeni sürüm için APK otomatik başlar. Aynı sürüm numarasıyla ikinci GitHub Release oluşturulmaz; bu koruma eski APK'nın yanlışlıkla ezilmesini önler.

## E-posta özelliklerini sonradan açma

Bu bölüm ilk APK kurulup uygulama çalıştıktan sonra yapılmalıdır.

### Uygulama içinden rapor e-postası göndermek

1. [Resend](https://resend.com/) hesabı açın.
2. Resend → **Domains** alanından size ait bir domain ekleyin; örneğin `tarihiiznikfirini.com`.
3. Resend'in gösterdiği DNS kayıtlarını domaini yöneten firmadaki DNS paneline ekleyin.
4. Resend domaini **Verified** gösterene kadar bekleyin.
5. Resend → **API Keys** alanından gönderme yetkili bir anahtar oluşturun.
6. GitHub **Secrets** sekmesine şunları ekleyin:

| Secret adı | Örnek değer |
|---|---|
| `RESEND_API_KEY` | Resend'in oluşturduğu API anahtarı |
| `REPORTS_FROM_EMAIL` | `Tarihi İznik Fırını <raporlar@alanadiniz.com>` |

7. GitHub **Variables** sekmesine `EMAIL_REPORTS_ENABLED` adında, değeri tam olarak `true` olan bir variable ekleyin.
8. **Deploy production** iş akışını bir kez elle çalıştırın.

### Zamanlanmış haftalık/aylık raporlar

Uygulama içi rapor e-postası çalıştıktan sonra GitHub **Variables** sekmesine `SCHEDULED_REPORTS_ENABLED` = `true` ekleyin. Bu değer yoksa zamanlanmış iş atlanır; boş veya hatalı e-posta gönderimi denemez.

### Yeni APK bağlantısını e-posta ile göndermek

APK dosyası e-posta ek sınırını aşabileceği için sistem dosyayı ek olarak göndermez. Bunun yerine GitHub Release'deki APK indirme bağlantısını e-postalar.

1. Yukarıdaki Resend kurulumunu bitirin.
2. GitHub **Secrets** sekmesine `APK_RELEASE_RECIPIENT_EMAIL` ekleyin. Değer, APK bağlantısını alacak e-posta adresidir.
3. GitHub **Variables** sekmesine `SEND_APK_BY_EMAIL` = `true` ekleyin.
4. Bir sonraki yeni APK sürümünde bağlantı otomatik gönderilir.

`SEND_APK_BY_EMAIL` yoksa veya `true` değilse APK yine oluşturulur; yalnızca e-posta adımı atlanır.

## Yerel geliştirme (yalnızca geliştiriciler için)

Uygulama kodunu değiştirecek kişiler için gerekenler: Node.js 22+, Git, Docker Desktop, Android Studio ve Supabase CLI.

```bash
npm ci
cp .env.example .env
npm run db:start
npm run db:reset
npm start
```

Yerel kalite kontrolleri:

```bash
npm run typecheck
npm run lint
npm test
npm run test:db
```

Hepsini tek seferde çalıştırmak için `npm run test:all` kullanın. Yerel test veritabanı üretim Supabase projesinden ayrıdır.

## Güvenlik ve bakım

- Deneme ve canlı kullanım için ayrı Supabase projeleri kullanın.
- `SUPABASE_SERVICE_ROLE_KEY` mobil uygulamaya veya `.env` dosyası dışında bir yere konmamalıdır.
- Bir anahtar sızarsa ilgili hizmetten hemen yenileyin; ardından GitHub Secret değerini güncelleyin.
- Fork kullanıyorsanız genel hata düzeltmelerini ana projeden düzenli olarak alın; müşteriye özel değişiklikleri kendi fork'unuzda tutun.

## Bağlantılar

- [Expo SDK 57 belgeleri](https://docs.expo.dev/versions/v57.0.0/)
- [Supabase belgeleri](https://supabase.com/docs)
- [GitHub Actions belgeleri](https://docs.github.com/actions)
- [Resend belgeleri](https://resend.com/docs)
