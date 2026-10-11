# Test Planı

## Amaç ve sınırlar

Bu plan, mevcut Expo 57 / React Native istemcisinin ve Supabase arka ucunun
halihazırdaki davranışlarını koruyacak testleri tanımlar. Yeni ürün davranışı
önermez. Uygulama testleri `npm test` ile Vitest'te; veritabanı/RPC testleri
temiz, yerel Supabase üzerinde `npm run test:db` ile; görünür Android davranışı
ise emulator smoke kontrolüyle çalıştırılmalıdır.

`test:db`, `scripts/run-db-integration.mjs` aracılığıyla yerel Supabase'i
başlatır ve `supabase db reset --local` ile migration + seed durumunu yeniden
kurar. Integration fixture'ları eşzamanlı olmayan tek fork'ta çalışır; her yeni
fixture benzersiz `ITEST-...` ön eki taşımalıdır. Remote Supabase'e karşı test
çalıştırılmaz.

## Mevcut kapsamın özeti

| Katman | Mevcut testler | Korunan davranış |
| --- | --- | --- |
| Ortam | `src/config/env.test.ts` | İki zorunlu public Supabase değişkeninin geçerli URL/boş olmayan anahtar olması. |
| Saf yardımcılar ve store | `tests/utils/**`, `tests/services/**`, `tests/store/receiptDraft.test.ts` | Tarih/para biçimi, hata eşleme, idempotency anahtarı, teslimat satırları, fiş özeti, bakiye, dağıtım, filtreler, picker ve PDF HTML üretimi/paginasyonu/XSS escape'i. |
| Rapor şemaları | `src/services/supabase/*ReportSchema.test.ts` | Özet, şubeler ve şube-hub PDF snapshot Zod sözleşmelerinin geçerli/geçersiz payload'ları. |
| Hook'lar | `tests/hooks/useBranchesAnalytics.test.ts`, `useReportExport.test.tsx`, `useReportEmail.test.tsx` | Sayfalama offset'i; PDF üretme/paylaşma durum makinesi, stale sonuç ve hata; e-posta gönderiminde hata loglanması. |
| Konum/yönetim RPC'leri | `adminLocations.integration.test.ts` | Şehir-ilçe-şube oluşturma, duplicate/negatif açılış bakiyesi, açılış kilidi, şube aktifliği, seçili şube ürünlerinin atomik oluşturulması; çeşitli admin/staff/anon ve bozuk-input kontrolleri. |
| Teslimat ve bakiye | `deliveries.integration.test.ts`, `branchBalanceConvention.integration.test.ts` | Teslimat oluşturma/güncelleme/yumuşak silme, ödeme etkisi, bakiye işaret kuralı ve create idempotency replay'i. |
| Katalog, fiyat ve şube hub | `productCatalog.integration.test.ts`, `branchHub.integration.test.ts` | Katalog ürünü/fiyatı/arşivi, aynı gün şube fiyatı güncellemesi, hub hareketleri ve bakiye görünümü. |
| Analitik ve rapor RPC'leri | `listBranchesAnalytics.integration.test.ts`, `summaryReportRpcs.integration.test.ts`, `branchesReportPdf.integration.test.ts`, `branchHubReportPdf.integration.test.ts` | Filtre, sıralama, sayfalama, metrik/ledger toplamları ve PDF snapshot'ları; rapor fonksiyonlarında admin izinli, staff/anon reddi ve pek çok geçersiz filtre. |
| Rapor e-posta ayarları | `reportEmail.integration.test.ts` | Alıcı/schedule yönetimi ile temel yetki ve e-posta biçimi doğrulaması. |

Önemli mevcut boşluklar: `useMutations.ts` ve çoğu katalog/konum/auth/query
hook'u test edilmemiştir; şube-ürün aktive/deaktive RPC yaşam döngüsü ayrı bir
integration sözleşmesiyle korunmuyor; teslimat ve manuel ödeme için tam
authorization/atomiklik hata matrisi eksiktir. Edge Functions, iş akışı YAML'ı
ve emulator ile gerçek APK kullanıcı yolculuğu otomatik test kapsamı dışında.

## Önceliklendirilmiş eksik senaryolar

Her yeni ya da değişen DB/RPC sözleşmesinde rol matrisi aynı integration
dosyasında bulunmalıdır: **admin başarılı**, **staff için iş kuralının izin
verdiği sonuç** (admin-only RPC'de red; günlük teslimat gibi staff yetkili
akışta başarı ve kısıtları), **anonim reddi** ve **bozuk giriş reddi**.
Aşağıdaki satırlarda bu matrisin zaten tam olmadığı mevcut RPC'ler özellikle
ayrıca yazılmıştır.

| Öncelik | Alan / özellik | Başlangıç durumu | Adımlar | Beklenen sonuç | Tür ve hedef |
| --- | --- | --- | --- | --- | --- |
| P0 | Teslimat oluşturma yetkisi ve atomiklik | Aktif şube, fiyatlı aktif şube ürünü, admin/staff/anon client | `create_delivery_atomic` için admin başarılı çağrı; staff'ın yalnız İstanbul bugünü ve `field_collection` ile başarılı çağrısı ile geçmiş/gelecek gün ve `bank_transfer` redleri; anon çağrısı; boş item, geçersiz UUID, negatif miktar/iade>teslim, geçersiz ödeme türü/tutar/tarih ayrı çağrıları | Geçerli çağrı delivery, item ve varsa ödeme oluşturur; staff yalnız kendi izinli günlük kaydını yapar; hatalı/izinsiz çağrı hiçbir kısmi satır veya bakiye değişimi bırakmaz | Integration; `tests/integration/deliveries.integration.test.ts`, `create_delivery_atomic` |
| P0 | Teslimat güncelleme ve silme izin/hata matrisi | Adminin oluşturduğu, ödemeli teslimat | `update_delivery_atomic` ve `soft_delete_delivery_atomic` için admin başarı; staff/anon; bilinmeyen/silinmiş delivery, boş item, bozuk satır ve boş silme nedeni | Geçerli işlem ilgili satırları ve bakiyeyi yeniden hesaplar; reddedilen çağrılar veriyi değiştirmez; silme bağlı ödemeleri de görünür hareketlerden çıkarır | Integration; `deliveries.integration.test.ts`, ilgili RPC'ler |
| P0 | Manuel tahsilat atomik işlemi | Aktif şube; önce teslimatla ve teslimatsız durum | `record_manual_payment_atomic` admin başarısı; staff/anon; sıfır/negatif tutar, geçersiz şube/teslimat, uyumsuz teslimat-şube ve geçersiz ödeme tipi | Tam olarak bir ödeme kaydı ve doğru bakiye etkisi; tüm hatalarda rollback; teslimata bağlıysa doğru ilişki | Integration (yeni veya deliveries dosyası); RPC ve `src/services/supabase/payments.ts` |
| P0 | İstemci teslimat/tahsilat mutation hata yolları | Mock servis, `QueryClientProvider`, logger spy | `useCreateDelivery`, `useUpdateDelivery`, `useSoftDeleteDelivery`, `useRecordManualPayment` başarısı ve reddedilen Promise ile çalıştırılır | Start/success/error logları doğru sırada; yalnız başarıda deliveries/payments/balance/analytics query key'leri invalidate edilir; create hata sonrası aynı idempotency anahtarının retry davranışı açıkça korunur | Hook; yeni `tests/hooks/useMutations.test.tsx` |
| P0 | RLS doğrudan tablo erişimi | Admin, staff, anon ve yalnız test fixture'ı için service-role client | Mobil rollerle `deliveries`, `delivery_items`, `payments`, `branch_products`, `branch_product_prices`, `profiles` için select/insert/update/delete denenir; gerekli RPC ile karşılaştırılır | Her tablonun mevcut RLS sözleşmesindeki izinli/reddedilen rol ve satırlar sabitlenir; staff başka kullanıcının satırına erişemez, anon sızıntı yapamaz. Test harness için verilmiş authenticated DML izni, production mutation yolu olarak yorumlanmaz; service role yalnız fixture amaçlıdır | Integration; yeni `tests/integration/rlsPolicies.integration.test.ts`, `20240101000002_rls_policies.sql`, `20240101000006_authz_rls.sql`, M20 |
| P0 | Şube-ürün aktivasyon/deaktivasyon yaşam döngüsü | Adminin oluşturduğu şube, katalog ürünü ve güncel fiyat; staff/anon | `activate_branch_product`, `set_branch_product_active`, `list_branch_products_with_status` ve personelin kullandığı `list_branch_products` çağrıları; aktif→pasif→aktif; aynı ürünü tekrar aktive; geçersiz UUID/fiyat | Aktivasyon fiyat geçmişini geçerli aralıkla açar; pasif ürün yeni teslimata seçilemez ama geçmiş hareket/rapor korunur; yeniden aktivasyon duplicate ilişki ya da çakışan fiyat aralığı yaratmaz; admin/staff/anon/bozuk-input matrisi korunur | Integration; yeni `tests/integration/branchProducts.integration.test.ts`, M03/M30/M33 RPC'leri; hook testleri `useProducts.ts` |
| P0 | Fiyat geçmişi ve tarihsel satış fiyatı | Aynı şube ürünü için farklı günlerde fiyat; en az bir eski teslimat | `set_branch_product_price_atomic` ile ileri tarihli fiyat, aynı gün yeniden düzenleme, geçmiş tarihe/çakışan aralığa giriş; iki tarihte teslimat | Her teslimat o günün fiyatını kullanır; eski teslimat toplamı fiyat düzenlemesinden etkilenmez; aralıklar boşluksuz/çakışmasızdır; geçersiz tarihler rollback olur | Integration; `branchHub.integration.test.ts` genişletmesi, `set_branch_product_price_atomic`, M33 |
| P1 | Katalog yönetimi tam matris | Katalog ürünü ve şubeye atanmış örnek ürün | Listeleme, default fiyat güncelleme, arşivle/aç; staff/anon ve boş ad, duplicate ad, negatif fiyat, bilinmeyen product id | Default fiyat sadece gelecekteki aktivasyon için kullanılır; mevcut şube fiyatı/tarihçesi bozulmaz; arşivli ürün aktif katalog listesinde görünmez ve mevcut geçmişi silinmez | Integration; `productCatalog.integration.test.ts`, M30 RPC'leri |
| P1 | Yönetim konumları tam yetki ve alt-öge durumu | Şehir→ilçe→şube fixture'ı | `set_city_active`, `set_district_active`, `set_branch_active`, liste RPC'leri, açılış kilidi okuma/yazma için admin/staff/anon/bozuk UUID | Parent/child aktiflik ve count sonuçları sözleşmeye uygun; izinsiz yazma/okuma sızdırmaz; hatalı istek kalıcı değişiklik yapmaz | Integration; `adminLocations.integration.test.ts`, M09 fonksiyonları |
| P1 | Yetki sınırı: staff günlük akışı | Staff'ın oluşturduğu teslimat ve başka kullanıcının/admin fixture teslimatı | `list_my_deliveries`, `get_delivery`, `list_deliveries_with_payments`, `get_branch_balance`; ID tahminiyle erişim denemesi | Staff yalnız kendi teslimatlarına ve uygulamanın izin verdiği şube bakiyesine erişir; yönetici hub/rapor ve başkasının teslimat detayları reddedilir | Integration; yeni `tests/integration/staffAccess.integration.test.ts`, tablo RLS ve M03/M15/M13 |
| P1 | İdempotency sınır durumları | Aktif şube/ürün ve benzersiz anahtar | Aynı anahtarla aynı payload replay; aynı anahtarla farklı payload; eşzamanlı iki create; anahtar yok/boş/geçersiz biçim | Replay tek delivery döndürür ve tek bakiye etkisi üretir; anahtar sözleşmesine aykırı isteğin davranışı (red veya tanımlı normal create) testte açıkça sabitlenir; yarış iki kayıt oluşturmaz | Integration; `deliveries.integration.test.ts`, M04 ve `create_delivery_atomic` |
| P1 | Rapor temel RPC'leri ve mutasyon sonrası tutarlılık | Bilinen delivery, return, payment ve soft-delete fixture'ı | `report_kpis`, `report_products_distribution`, `report_top_branches`, `report_collection_ranking`, `report_balance_ranking`, `report_daily_series` için filtreli/boş pencere çağrıları; staff/anon ve geçersiz range/day | Tüm toplamlar soft-delete'i dışlar, iade ve tahsilatı doğru ayırır, sıralama deterministiktir; yetki/validation matrisi sağlanır | Integration; yeni `tests/integration/reportsDashboard.integration.test.ts`, `src/services/supabase/reports.ts`, M03/M18 |
| P1 | PDF rapor verisi–render bütünlüğü | Summary, branches, branch-hub snapshot fixture'ları | RPC'den dönen snapshot ilgili `parse*` fonksiyonundan geçirilir, sonra PDF builder'a verilir; tarih/ürün/şehir filtreleri ve boş sonuç | Şema doğrulaması ve PDF başlık/filtre/toplam metinleri aynı sözleşmeyi taşır; geçerli RPC payload'u istemcide parse hatası vermez | Integration + unit; mevcut üç report integration dosyası ve `src/services/supabase/*ReportSchema.ts`, `src/utils/pdf/**` |
| P1 | Rapor e-posta ayarları ve istemci mutation'ları | Admin/staff/anon; benzersiz alıcı | Recipient ekle/güncelle/devre dışı bırak/sil, `weekly`/`monthly`/`disabled`; ID/e-posta/mode bozuk girişleri; hook success/error | Admin ayarları kalıcı ve listeyle tutarlı; staff/anon reddedilir; hook yalnız başarıda ilgili query'leri invalidate eder ve hatayı success olarak loglamaz | Integration + hook; `reportEmail.integration.test.ts`, yeni/genişletilmiş `tests/hooks/useReportEmail.test.tsx`, M31 |
| P1 | Query hook sözleşmeleri | Mock servis/logger ve query client | `useProducts`, `useAdminLocations`, `useLocations`, `useDeliveries`, `useLedger`, `useReports`, `useSession` için enabled=false, başarı, hata, sayfalama ve query key | Boş bağımlı ID ile ağ çağrısı yapılmaz; doğru servis/RPC adı instrument edilir; hata UI'ya taşınır; infinite hareketler limit/offset'te durur | Hook; ilgili `tests/hooks/*.test.tsx`, `src/hooks/**` |
| P2 | Auth bootstrap, giriş/çıkış ve yönlendirme | Mock auth repository; admin, staff, anonim session | `useAuthBootstrap`, `useSignIn`, `useSignOut`, route guard/layout kararları için loading, invalid credential, session restore, logout | Doğru role göre admin/staff/auth rotası seçilir; hata state'i gösterilir; logout sonrası sorgu cache'i/sensitive ekran geri dönmez | Hook/component; yeni `tests/hooks/useAuth*.test.tsx` ve gerekirse `src/app/**/_layout.tsx` |
| P2 | Environment yapılandırması | Stub edilmiş process env | Boş, URL olmayan, yalnız bir değer, doğrulama öncesi `getEnvConfig`, module reset sonrası farklı değer; APK workflow için ayrıca HTTP URL fixture'ı | Uygulama `validateEnv` mevcut URL/anahtar sözleşmesini korur ve cache testler arası sızmaz; release workflow HTTP URL'yi migration/build öncesi reddeder | Unit + workflow/manuel doğrulama; `src/config/env.test.ts`, `build-release-apk.yml` |
| P2 | Edge Function e-posta akışı | Local Deno/Supabase Function test ortamı veya fetch/Resend mock'u | `send-report-email` ve `deliver-scheduled-report`: admin/anon çağrısı, kapalı e-posta ayarı, boş recipient, Resend başarısızlığı, kısmi recipient başarısızlığı, tarih aralığı | Yetkisiz çağrı veri/e-posta göndermez; kapalı yapılandırma güvenle atlanır; hata açıkça raporlanır ve diğer recipient sonuçları tanımlı kalır | Function integration/unit; `supabase/functions/send-report-email`, `deliver-scheduled-report`, `_shared/report-email.ts` |
| P2 | CI, environment ve APK yayın akışı | GitHub Actions çalışma kopyası veya güvenli local workflow lint/fixture | `ci.yml`, `deploy-production.yml`, `build-release-apk.yml`: eksik secret, HTTP Supabase URL, tekrar eden version tag, public config eksikliği, APK bundle içindeki iki public değişken | CI kalite kapılarını çalıştırır; deploy eksik/bozuk config ile migration'a geçmez; release aynı tag'i ezmez; APK yalnız gerekli public Supabase değerleri gömülüyken yayınlanır | Workflow/manuel CI doğrulaması; `.github/workflows/*.yml`, `app.json`, `src/config/env.ts` |
| P2 | Android tablet smoke: personel günlük kayıt | 1600×2560 landscape emulator, seed admin/staff hesabı, local veya test backend | Staff giriş; şube ve ürün seç; teslimat/iade/tahsilat gir; kaydet; geçmiş ve bakiye kontrolü; başarısız ağ/bozuk input mesajını gözle | Ekranlar görünür ve scroll edilebilir, kritik container'lar `flex: 1` nedeniyle çökmemiştir; kayıt tek kez oluşur, fiş/geçmiş/bakiye tutarlıdır; hata kullanıcıya görünür | Manuel Android smoke; `StaffHomeScreen`, `StaffHistoryScreen`, `useMutations.ts` |
| P2 | Android tablet smoke: yönetim ve rapor | Aynı emulator, admin hesabı | Şehir/ilçe/şube ekle; ürün aktivasyonu ve fiyat değişimi; şube hub hareketleri; filtreli özet/şube/şube-detay PDF preview/export/share; e-posta ayar ekranı | Safe-area ve alt gezinme doğru yerde; liste/Sheet/PDF akışı çalışır; fiyat/aktiflik değişimi yenilenmiş ekrana yansır; Android paylaşım hata mesajı anlaşılırdır | Manuel Android smoke; admin screens, `useProducts.ts`, `useReportExport.ts` |

## Ayrıştırılmış ek vaka kataloğu

Bu vakalar yukarıdaki satırların alt senaryolarıdır. Uygulamada görünen mevcut
tablo, RPC ve istemci davranışlarından çıkarılmıştır; yeni özellik talebi
değildir. Aynı feature için birden fazlası tek testte değil, hata nedenini
izole edecek kısa testlerde yazılmalıdır.

| Alan | Başlangıç durumu | Adımlar | Beklenen sonuç | Tür / ilgili hedef |
| --- | --- | --- | --- | --- |
| Teslimat satır bütünlüğü | Aktif fiyatlı iki ürün | Tek teslimatta iki farklı ürün, sonra aynı ürün iki kez; delivered=returned ve delivered>returned gönder | Farklı ürün toplamı satır fiyat snapshot'larıyla hesaplanır; sıfır net satış izinliyse toplamı değiştirmez; duplicate satırın mevcut DB kuralındaki sonucu sabitlenir; negatif net miktar reddedilir | Integration; `create_delivery_atomic`, `delivery_items` constraints |
| Para hassasiyeti | Ondalıklı fiyatlı ürün | 0.01/ondalıklı fiyat ve iade ile teslimat, ondalıklı tahsilat oluştur | `NUMERIC(12,2)` toplamı ve bakiye iki ondalıkta korunur; JS formatlama/veri eşlemesi yuvarlama farkı üretmez | Integration + unit; delivery RPC, `receiptSummary`, `formatters` |
| Fiyat geçerlilik sınırı | Bir şube ürünü için bitişi olan eski ve açık yeni fiyat | Tam `end_date`, ertesi gün ve fiyat arası boş gün için create/update teslimatı çağır | Sınır gününde doğru fiyat seçilir; kapsanmayan gün "No price found" ile rollback olur; hiçbir yarım delivery kalmaz | Integration; `get_effective_price`, `set_branch_product_price_atomic`, `create_delivery_atomic` |
| Fiyat değişikliği geçmişe karşı | Gelecekte planlı fiyat değişimi | Aktif fiyatın başlangıcından önce/eşit/sonra effective date ile yeni değişiklik iste | M33'teki aynı gün overwrite, daha erken tarih red ve ileri tarih planlama semantiği; price aralıkları doğrulanır | Integration; `branch_product_prices`, M33 |
| İnaktif kaynaklar | Sırasıyla pasif şube, pasif şube ürünü, arşivli katalog ürünü fixture'ı | Her biriyle teslimat oluşturmayı dene; geçmiş teslimatı/hub raporunu oku | Yeni işlem yalnız migration'ın izin verdiği aktif kaynaklarla olur; geçmiş finansal kayıt silinmez veya yeniden fiyatlanmaz | Integration; `create_delivery_atomic`, katalog/branch-product RPC'leri |
| Teslimat güncelleme ve ödeme ilişkisi | Ödemeli bir teslimat | Delivery item/date güncellenir; sonra delivery silinir | Update sadece delivery toplamını değiştirir ve bağlı ödeme korunur; soft delete bağlı aktif ödemeyi de siler; bakiye iki aşamada doğrulanır | Integration; `update_delivery_atomic`, `soft_delete_delivery_atomic` |
| Silme denetim izi | Adminin oluşturduğu teslimat ve manuel tahsilat | Delivery sil; `audit_logs`, `deleted_at`, `deleted_by`, `deletion_reason` oku | Audit satırı doğru operation/table/record/user ve eski snapshot'ı taşır; yumuşak silme gerekçesi korunur | Integration; `log_audit`, `soft_delete_delivery_atomic` |
| Hesap role escalation | Staff ve admin profile fixture'ı | Staff kendi `role`, `is_active`, `id` alanlarını değiştirmeyi; adminin normal profil güncellemesini dene | Staff trigger tarafından reddedilir; admin için migration'ın izin verdiği işlem korunur; profil değişikliği başka kullanıcının yetkisini yükseltmez | Integration; `prevent_role_escalation`, `users_no_escalation` trigger |
| Staff gün sınırı / saat dilimi | Staff client ve Istanbul tarihinin çevresindeki fixture | İstanbul dünü, bugünü, yarını ile create/update; test saati UTC gün değişimine yakınsa tarihi açıkça hesapla | Staff yalnız `Europe/Istanbul` bugünü ve field collection kuralıyla işlem yapar; admin tarih kısıtından muaftır | Integration; M06 `create_delivery_atomic`, `update_delivery_atomic`, `getIstanbulToday` |
| Staff sahiplik sınırı | İki farklı staff kullanıcısının delivery fixture'ı | İlk staff ikinci staff'ın delivery'sini get/update/delete etmeyi dener; kendi geçmiş kaydını listeler | RLS/RPC diğer kullanıcının kaydını vermez/değiştirmez; `listMyDeliveries` mevcut istemci filtresi nedeniyle yalnız bugünün kendi aktif kayıtlarını döndürür | Integration + repository/hook; RLS, `deliveries.ts` |
| Açılış bakiyesi matematiği | Kilit açılmış yeni şube; sonra kilitli config | Pozitif açılış bakiyesi, satış, tahsilat ve soft delete işle; ardından kilitliyken sıfır/pozitif değerle şube yarat | `opening + aktif satış - aktif ödeme` her adımda current balance ve `get_branch_balance` ile eşleşir; kilit kuralı korunur | Integration; `recalculate_branch_balance`, M05/M09 |
| Bakiye fan-out regresyonu | Bir şubede birden çok teslimat ve birden çok ödeme | Ayrı ayrı ve aynı delivery'e bağlı ödemeler oluştur; her işlemden sonra bakiye oku | Ödeme sayısı satış toplamını çoğaltmaz; canonical balance tüm aktif satırların bağımsız toplamıdır | Integration; `branchBalanceConvention.integration.test.ts`, `recalculate_branch_balance` |
| Idempotency kullanıcı/şube sınırı | İki kullanıcı ve iki şube | Aynı idempotency key'i farklı staff/admin veya farklı şube/payload ile kullan | Unique anahtarın mevcut global davranışı güvenlik/finansal açıdan sabitlenir; başka kayda ait ID sızdırıyorsa bu test bulgu olarak işaretlenir ve sözleşme değişikliği ayrı karara bağlanır | Integration; M04/M06 `create_delivery_atomic` |
| Tekrar deneme istemci davranışı | `useCreateDelivery` servis mock'u: ilk çağrı ağ hatası, ikinci çağrı başarı | Aynı mutation nesnesinde retry; ardından yeni başarılı kayıt | Hata sonrası idempotency key'in korunup korumadığı testte görünür olur; başarıdan sonra key sıfırlanır ve sonraki bağımsız kayıt yeni anahtar alır | Hook; `useMutations.ts`, `idempotency.ts` |
| Liste ve pagination sınırları | Bir şube için limit+1 ve limit×2 hareket | `useBranchMovementsInfinite`/`list_deliveries_with_payments` ilk, ara, son sayfayı; boş son sayfayı çağır | Offset atlamaz/tekrar etmez; son sayfada next page yoktur; yumuşak silinen delivery ve payment görünmez | Hook + integration; `useAdminLocations.ts`, M15 |
| Arama/filtre normalize etme | Şehir, ilçe, aktif/pasif şube ve Türkçe karakterli isim fixture'ı | Boş string/dizi, city–district uyuşmazlığı, büyük-küçük harf/boşluklu arama, tarih uçlarıyla analytics/report çağrısı | `omitEmpty` yalnız boş filtreleri iletmez; RPC doğrulaması geçersiz eşleşmeyi doğru ele alır; sıralama ve total sayısı filtreyle uyumludur | Unit + integration; `analytics.ts`, `list_branches_analytics`, `report_branches_pdf` |
| Dashboard rapor range sözleşmesi | Aynı güne ve range sınırına düşen hareketler | `today`, `week`, `month`, `all` için KPI/dağılım/günlük seri çağır; range dışı bir hareket ekle | Dahil etme tarih sınırları bütün dashboard RPC'lerinde aynı; boş range sıfır/boş şekliyle istemci grafiğini bozmaz | Integration; `report_kpis`, `report_*`, `report_daily_series` |
| Rapor limit ve sıralama determinismi | Eşit metrikli iki ürün/şube | Dağılım RPC'lerini limit 1 ve varsayılan limit ile çağır; eşitlikte birden fazla kez çalıştır | Limit uygulanır; eşit metriklerde DB'nin belirlenmiş ikincil sıralaması stabil kalır ya da sözleşme eksikliği görünür bulgu olur | Integration; `report_product_distribution`, `report_branch_distribution`, `report_branch_income`, `report_branch_return_rate` |
| Repository dönüşüm hataları | Mock edilmiş Supabase cevapları | `deliveries.ts` için null branch/product, boş user, Supabase hata, boş data ve nested join null; `analytics.ts` için beklenmeyen JSON | Mevcut fallback (`—`/boş değer) yalnız beklenen nullable alanlarda kullanılır; taşıma hatası throw olur, yanlış finansal veri üretilmez | Unit; `src/services/supabase/deliveries.ts`, `analytics.ts` |
| Fiş görünümü ve satır sırası | Çok satırlı delivery, ödeme yok/tek/çok, ürün adı eksik fixture | `fetchReceiptSummary` çıktısını ve `buildReceiptSummary` toplamlarını test et | Item toplamı, iade, tahsilat ve kalan bakiye doğru; ilişkisiz manuel ödeme fişe dahil edilmez; ürün adı fallback'i güvenlidir | Unit; `deliveries.ts`, `receiptSummary.ts` |
| Auth yaşam döngüsü yarışları | Deferred promise ve auth event callback mock'u | Bootstrap sürerken unmount; getSession başarısız; session event, ardından geç gelen profile cevabı; inactive profile | Unmount sonrası store set edilmez; hata logout+reset olur; active profile set edilir; erişim tokenı/parola logger'a yazılmaz | Hook; `useAuthBootstrap.ts`, `useSignIn.ts`, `logger.ts` |
| Sign-in / sign-out hata bütünlüğü | Auth/session/store/logger mock'u | Hatalı parola, profile fetch hatası, inactive user, signOut hata ve başarılı logout | Inactive user session'ı kapatır; başarılı logout store ve query cache'i temizler; başarısız logout mevcut state'i silmez; logda parola bulunmaz | Hook; `useSignIn.ts`, `useSignOut.ts` |
| Network/offline kullanıcı durumu | NetInfo/event mock'u | Online→offline→online, app açılırken belirsiz bağlantı, mutation esnasında bağlantı kaybı | Banner/store doğru güncellenir; başarısız mutation hata yoluna girer; kullanıcı double-tap yerine retry ile idempotent sonuca gider | Hook + Android smoke; `useOnlineStatus.ts`, `store/connectivity.ts`, mutation hooks |
| Zod şema forward/backward hata mesajı | Her report schema için valid JSON'un tek alanı null/yanlış tip | Required nested array/metadata/ranking alanlarını tek tek boz; ekstra alan ekle | Eksik veya malformed sözleşme açık parse hatası verir; bilinçli extra-field davranışı (strip/passthrough) testte sabitlenir | Unit; `*Schema.test.ts` |
| PDF export dosya ve paylaşım sınırları | Print/render/share mock'ları | Boş snapshot, render null URI, share unavailable, user iptali, aynı anda iki export | UI stale job sonucunu kullanmaz; hazır PDF korunur/uygun hata gösterilir; dosya yolu paylaşım katmanına doğru iletilir | Hook/unit; `useReportExport.ts`, `pdf/render.ts`, `expo-sharing` entegrasyonu |
| Uygulama kabuğu Android dayanıklılığı | Landscape tablet emulator | İlk açılış, klavye açıkken form, uzun şehir/şube/ürün adı, loading/error/empty states, navigation tab değişimi | Safe-area ve gizli sistem navigation bar alt içeriği örtmez; kritik alanlar yükseklik kaybetmez; uzun içerik taşmaz veya erişilemez olmaz | Manuel Android smoke; `_layout.tsx`, admin/staff shell ve ekranlar |

## Ekran akışlarına göre ek vaka kataloğu

Bu bölüm, kullanıcının izlediği akışa göre testleri daha küçük doğrulamalara
böler. UI seviyesindekiler React Native Testing Library ile component/hook
testi, cihaz davranışı gerektirenler Android smoke, sunucu kuralları ise local
Supabase integration testidir.

| Akış | Başlangıç durumu | Adımlar | Beklenen sonuç | Tür / hedef |
| --- | --- | --- | --- | --- |
| Uygulama açılışı | Session yok | Root layout bootstrap tamamlanana kadar bekle | Splash/restore anında yanlış admin veya staff ekranı kısa süre görünmez; tamamlanınca auth rotası açılır | Component/hook + Android smoke; `src/app/_layout.tsx`, `useAuthBootstrap` |
| Uygulama açılışı | Aktif admin session ve admin profile | Restore sonrası root yönlendirmesini gözle | Sadece admin stack/shell açılır; staff sekmeleri gösterilmez | Component/hook; root ve `(admin)/_layout.tsx` |
| Uygulama açılışı | Aktif staff session ve staff profile | Restore sonrası root yönlendirmesini gözle | Sadece staff home/history stack açılır; admin URL/stack erişimi korunur | Component/hook; root ve `(staff)/_layout.tsx` |
| Uygulama açılışı | Session var, profile yok veya inactive | Bootstrap başlat | `signOut` çağrılır, store temizlenir ve sign-in açılır; exception/crash olmaz | Hook; `useAuthBootstrap.ts` |
| Giriş formu | Boş e-posta/parola | Gönder tuşu ve klavye submit tetikle | Form mevcut disabled/validation davranışına göre gereksiz auth çağrısı yapmaz; alan/uyarı erişilebilir kalır | Component; `SignInScreen.tsx` |
| Giriş formu | Geçerli email/parola, auth başarısız | Gönder; sonra tekrar gönder | Hata anlaşılır görünür; buton pending süresince çift çağrı üretmez ve yeniden deneme mümkündür | Component + hook; `SignInScreen.tsx`, `useSignIn.ts` |
| Giriş formu | Geçerli aktif kullanıcı | Parola görünürlük ikonunu aç/kapat, klavye submit ile giriş yap | Parola input tipi değişir ama değer kaybolmaz; başarı role yönlendirmesiyle tamamlanır; logda parola yoktur | Component + hook; `SignInScreen.tsx` |
| Shell logout | Her iki rolde açık sayfa ve dolu query cache | Logout confirm aç, iptal et; sonra onayla; servis hata versin | İptal state'i değiştirmez; başarı auth store/cache temizleyip sign-in'e döner; hata halinde kullanıcı mevcut ekranda kalır | Component/hook; `AdminShell`, `StaffShell`, `useSignOut` |
| Staff: şube seçimi | Boş draft | Şehir seç, sonra şehir değiştir; ilçe seç, sonra ilçe değiştir | Üst seçim değişince alt ilçe/şube ve ürün entry'leri resetlenir; disabled picker ağ çağrısı yapmaz | Store + component; `BranchSelector`, `receiptDraft.ts`, `useLocations.ts` |
| Staff: tarih seçimi | Seçilmiş şube ve ürün entry'leri | Tarihi değiştir, sonra önceki tarihe dön | Ürün sorgu anahtarı tarihe göre yenilenir; eski tarihte fiyat yoksa empty/error yoluna düşer; draft'taki miktarlar yanlış ürüne bağlanmaz | Hook/component + integration; `StaffHomeScreen`, `useBranchProducts`, price RPC |
| Staff: ürün kartı | Aktif ürünler ve boş entry | Teslim/iade stepper'ını sıfıra, pozitif değere, iade>teslim durumuna getir | Preview yalnız sıfır olmayan satırları kullanır; UI/utility negatif net satışın sunucuya gidişini engeller veya sunucu reddini görünür kılar | Component/unit + integration; `ProductCard`, `receiptDraft`, `deliveryItems` |
| Staff: üç aşamalı wizard | Boş/eksik draft | İleri/Geri ile aşamalar arasında ilerle, phase 3'te geri dön | Şube olmadan 1→2, ürün olmadan 2→3 geçilemez; geri dönüş seçimi/miktarı/tahsilatı korur | Component; `StaffHomeScreen.tsx` |
| Staff: tahsilat preview | Seçilmiş ürünler ve bilinen şube bakiyesi | Tahsilatı 0, kısmi, satıştan fazla ve ondalıklı değer yap | Gerekli tutar, tahsilat ve yeni bakiye aynı sign convention ile görünür; geçersiz sayısal metin safe biçimde ele alınır | Unit/component; `PaymentReceivedInput`, `CheckoutSummary`, `receiptPreview.ts` |
| Staff: kayıt sonucu | Başarılı create RPC | Kaydet, result ekranındaki "Yeni Kayıt"a bas | Receipt'te doğru şube/tarih/tahsilat/yeni bakiye; draft temizlenir, `last` bellek davranışı korunur; yeni kayıt boş phase 1'e döner | Component/hook; `StaffHomeScreen`, `receiptDraft` |
| Staff: double tap ve ağ kesintisi | Create mutation pending veya ilk çağrı hata | Kaydet'e hızlı iki kez bas; hata sonrası tekrar dene | Pending iken tek RPC; retry idempotency stratejisiyle tek financial kayıt; hata mesajı phase 3 bağlamında kalır | Component/hook/integration; `MutationButton`, `useCreateDelivery` |
| Staff: güncel kayıt listesi | Staff için bugün iki kayıt, eski gün bir kayıt | History aç, pull-to-refresh yap, yeni kayıt sonrası dön | Liste yalnız repository'nin bugünkü kendi aktif kayıtlarını tarih/created_at sırasıyla gösterir; yeni kayıt invalidation sonrası görünür | Integration + component; `listMyDeliveries`, `StaffHistoryScreen` |
| Staff: kayıt detayı | History satırı ve delivery'e bağlı/bağsız ödeme | Satıra basıp detail sheet aç/kapat | Lazy `useDelivery` doğru ID ile çağrılır; ürün/iade/ödeme yüklenirken hata/boş durumları sheet'i bozmaz | Component/hook; `StaffHistoryScreen`, `MovementDetailSheet`, `useDelivery` |
| Staff: kayıt düzenleme | Bugünkü staff-owned delivery | Edit ikonu → onay/iptal → home; prefill tamamlanmadan kullanıcı alan değiştirir | İptalde draft/router değişmez; onayda yalnız bir kez prefill olur, kullanıcı sonradan yazdığını geç gelen sorgu ezmez; update ödeme tutarını değiştirmez | Hook/component + integration; `canEditDelivery`, `useEditPrefill`, `update_delivery_atomic` |
| Staff: düzenleme süresi | Bugünün ve eski günün delivery fixture'ı | History'de edit affordance ve doğrudan update RPC dene | UI eski kaydı düzenleme için sunmaz; server staff'ın tarih/deadline kuralını da uygular | Component + integration; `StaffHistoryScreen`, M06 update RPC |
| Admin: coğrafya drilldown URL'si | `/cities` parametresiz, tek/değişken çoklu `city`/`district` parametreleri | Her URL'yi aç, geri/ileri gezin | `pickFirst` ilk parametreyi seçer; city yoksa cities, district yoksa districts, ikisi varsa branches seviyesi; bozuk ID sorgu hata state'ine gider | Unit/component; `useGeographyDrilldown.ts`, `CitiesScreen` |
| Admin: şehir/ilçe formu | İlgili level açık | Boşluk adı, tekrar ad, submit sırasında çift tıklama, RPC error | Trim edilmiş değer gönderilir; client zorunlu/numerik validasyonunu gösterir; sheet hata sonrası açık ve tekrar denenebilir; başarıda yalnız ilgili liste invalidation olur | Component/hook/integration; `FormSheet`, `CitiesScreen`, create RPC'leri |
| Admin: şube oluşturma | Açılış bakiyesi kilitli/açık, katalog load success/error | Ürün seçmeden, duplicate ürün seçerek, virgüllü fiyatla, kilitli non-zero açılışla ve katalog hatasıyla gönder | Buton mevcut UI kurallarına göre disabled olur; valid şube ve seçili ürün/fiyat tek atomik RPC ile oluşur; hata yarım şube bırakmaz | Component + integration; `CreateBranchSheet`, `create_branch` |
| Admin: aktiflik toggle | Aktif ve pasif city/district/branch | Action menu toggle, sonra ilgili liste/hub/analytics'e dön | Etiket/action hedef durumu doğru tersine çevirir; başarıdan sonra count ve bağlı cached görünüm güncellenir; hata optimistic yanlış görünüm bırakmaz | Hook/component + integration; `CitiesScreen`, `useSet*Active` |
| Admin: katalog ekranı | Aktif/arşivli ürünler, Türkçe karakterli isimler | Arama, aktif/arşiv/all filtreleri, create, default price edit, archive/unarchive | Filtre ve search kesişimi doğru; liste `includeArchived=true` ile karar verir; mutation başarı/hata sonrası sheet ve cache tutarlı kalır | Component/hook + integration; `ProductsScreen`, `useProducts` |
| Admin: şubeler tabı filtre draft/apply | Bir filtre uygulanmış, formda başka değerler | Filter sheet aç; değiştirip kapat; apply/reset yap | Sorgu yalnız apply ile değişir; kapatma applied filtreyi bozmaz; reset arama/sıralama dahil planlanan defaultları geri getirir | Component/unit; `BranchesTableScreen`, `BranchFilters`, `branchFilters.utils` |
| Admin: şubeler tabı sort/pagination | 50+ branch sonucu | Kolona aynı yönde iki kez bas; load more; filtreyi değiştir | İlk basış hedef sort, ikinci basış direction flip; pages tek listede duplicate olmadan birleşir; filtre değişince offset 0'dan yeni key başlar | Hook/component + integration; `useBranchesAnalytics`, `BranchesTableScreen` |
| Admin: şubelerden hub'a geçiş | Analytics row | Satıra ve hub action'a bas; geçersiz route parametresi ile aç | Doğru branch ID taşınır; invalid ID error state verir; hub etkinlik toggle rapor/analytics cache'ini doğru yeniler | Component/hook; `BranchesTableScreen`, `BranchHubScreen` |
| Admin: hub sekmeleri | Hareketli şube | Details/Products/Movements arası geç; hareket sayfaları yüklenmişken sekmeye dön | Aktif tab görsel/a11y durumu doğru; cached hareket sayfaları korunur; balance/details kısmi yüklenirken summary yanlış hazır state göstermez | Component/hook; `BranchHubScreen`, `useBranchHubSummary`, `useBranchMovementsInfinite` |
| Admin: hub ürün kartı | Aktif, pasif ve aktivasyona uygun katalog ürünü | Fiyat düzenle, aktifliği kapat/aç, inactive ürünü aktive et; formu iptal et | Card doğru action ve fiyat gösterir; aktiflik/fiyat sonrası status ve staff ürün query'leri invalidate edilir; duplicate activation sunucu hatası kullanıcıya ulaşır | Component/hook/integration; `ProductsTab`, `BranchProductCard`, product mutations |
| Admin: hareket detay sheet | Delivery ve manuel payment satırı | Her satırı aç; delivery detail fetch error; soft-deleted hareket | Delivery detail lazy yüklenir, payment satırı yanlış delivery fetch'i yapmaz; mevcut RPC'nin gösterdiği deleted/aktif semantiği görünümle uyumludur | Component/hook; `MovementsTab`, `MovementDetailSheet` |
| Admin: özet ekranı | Range değiştirilebilir, bir query hata/diğerleri başarılı | today/week/month/all seç; bir kartı retry et | Her kart kendi query error/loading durumunu taşır; range değişince previous data flash'i yanlış range etiketiyle sunulmaz; retry sadece ilgili query'yi çağırır | Component/hook; `SummaryScreen`, `useReports` |
| Rapor filtre drawer'ı | Şehir/ilçe/ürün verisi | Preset/custom tarih, ters tarih, city değişimi, ürünlerin hiçbiri/tümü/bazısı seçimi | Ters tarih Create'i disable eder; city değişimi district'i temizler; boş ve tüm ürün seçimi `null` (= filtresiz), kısmi seçim ID dizisi olur | Component/unit; `ReportFilterConfig`, `ProductFilterSidebar` |
| PDF export drawer | Export kapalı/idle, fetching/rendering/error/ready | Aç-kapat, filter create, hata retry, ready share/e-posta panelini aç, return-to-filters | Her state doğru CTA'yı gösterir; kapatma çalışmayı yanlışlıkla resetlemezse mevcut davranış sabitlenir; retry aynı parametreyi kullanır; share busy çift çağrıyı engeller | Component/hook; `ExportSheet`, `useReportExport` |
| PDF export cache tazeliği | Aynı parametreyle iki özet export arasında yeni hareket | İki kez summary export çalıştır | `staleTime: 0` fetchQuery ikinci snapshot'ı alır; dosya adı/context yeni snapshot ile tutarlıdır | Hook/integration; `useSummaryPdfExport`, `report_summary_pdf` |
| Rapor e-posta UI | Ayarlar/alıcılar loading, error, boş ve dolu | E-posta boşluklu gir, ekle, aynı adresi tekrar ekle, sil, schedule değiştir | E-posta trim edilir; pending butonlar tekrar göndermeyi engeller; başarıda input temizlenir ve doğru query refresh olur; server hatası ekranda kaybolmaz | Component/hook/integration; `EmailReportsSettingsScreen`, `useReportEmail` |
| Manuel rapor e-postası | Ready PDF/export params ve recipient seçimi | Hiç alıcı olmadan/çok alıcıyla gönder; Edge Function kısmi hata döndürsün | Geçerli input dışında çağrı yapılmaz; kısmi teslimat `ReportEmailDeliveryError` olarak doğru loglanır ve kullanıcıya hata/sonuç sözleşmesine göre yansır | Hook/function test; `useSendReportEmail`, `reportEmail.ts`, Edge Function |
| Bağlantı banner'ı | NetInfo başlangıç state'i belirsiz | `isConnected` null/false/true ve `isInternetReachable` null/false/true eventleri sırayla gönder | Online yalnız iki değer de açıkça false değilse true; unsubscribe sonrası store güncellenmez; banner root layout'ta doğru görünür | Hook/component; `useOnlineStatus`, connectivity store, `NetworkBanner` |

## Uygulama sırası ve kalite kapıları

## Minimal test uygulama planı

Amaç, tüm kataloğu bir kerede uygulamak değil; finansal veri ve yetki
regresyonlarını önce güvenceye alıp mevcut test altyapısına küçük eklemeler
yapmaktır. Her adım bittiğinde mevcut kalite kapıları çalıştırılır; sonraki adıma
ancak önceki adım yeşilken geçilir.

1. `tests/integration/deliveries.integration.test.ts` dosyasını genişlet.
   `create_delivery_atomic`, `update_delivery_atomic`,
   `soft_delete_delivery_atomic` için admin başarılı, staff'ın izinli/kısıtlı
   günlük akışı, anon red ve bozuk-input/rollback vakalarını ekle. Aynı dosyada
   `record_manual_payment_atomic` için başarı, rol redleri, negatif/sıfır tutar
   ve yanlış şube doğrulamasını kapsa.

2. Yeni `tests/integration/branchProducts.integration.test.ts` oluştur.
   Bir fixture şube/ürün üzerinden aktivasyon, deaktivasyon, yeniden aktivasyon
   ve ileri tarihli fiyat değişimini test et. Pasif ürünle teslimat oluşturma
   redini ve geçmiş fiyat snapshot'ının değişmediğini doğrula. Her RPC için
   admin, staff, anon ve bozuk-input matrisi uygula.

3. Yeni `tests/hooks/useMutations.test.tsx` oluştur.
   Dört finansal mutation'ın (`useCreateDelivery`, `useUpdateDelivery`,
   `useSoftDeleteDelivery`, `useRecordManualPayment`) success/error yollarını
   servis ve logger mock'larıyla test et. Başarıda doğru query key'lerinin
   invalidate edildiğini, hatada invalidate edilmediğini ve create retry'sının
   idempotency anahtarını koruduğunu doğrula.

4. Yeni `tests/integration/staffAccess.integration.test.ts` oluştur.
   İki staff fixture'ı kullanarak `list_my_deliveries`, `get_delivery` ve
   delivery update erişimini sınırla: kullanıcı yalnız kendi görünür kaydını
   görebilmeli/değiştirebilmelidir. Admin-only hub/rapor RPC'lerinde staff ve
   anon redlerini tek bir yetki regresyon grubu olarak koru.

5. Rapor ve UI testlerini sonraki küçük PR'lara ayır.
   İlk olarak `useReports`, `useProducts`, `useAdminLocations` query key /
   `enabled` / hata yollarını hook testiyle; sonra dashboard ve PDF RPC
   toplama-sınır durumlarını integration testiyle ekle. Ekran değiştiğinde
   ilgili staff veya admin Android smoke senaryosunu uygula.

İlk dört adım tamamlandığında çalıştırılacak komutlar:

```bash
npm run typecheck
npm run lint
npm test
npm run test:db
npm run test:integration
```

1. Önce P0 veritabanı atomik işlem/RLS testleri ve bunların kullandığı hook
   mutation testleri eklenmelidir. Finansal veya yetki regresyonlarının riski
   en yüksektir.
2. Ardından P1 şube-ürün/fiyat yaşam döngüsü ve dashboard/rapor tutarlılığı
   tamamlanmalıdır.
3. P2 istemci kenar durumları, Edge Function ve yayın akışı doğrulamalarıyla
   kapatılmalıdır. Android smoke, ekranı değiştiren her PR'da tekrarlanır.

Her uygulanmış dilimden önce PR kalite kapıları çalıştırılır:

```bash
npm run typecheck
npm run lint
npm test
npm run test:db
npm run test:integration
```

DB/RPC değişikliğinde ilgili integration testi admin başarılı + staff için
beklenen izin/red sonucu + anonim reddi + bozuk-input reddini içermeden
tamamlanmış sayılmaz. Ekran değişikliklerinde bunlara ek olarak belirtilen
Android emulator smoke sonucu PR notuna eklenir.
