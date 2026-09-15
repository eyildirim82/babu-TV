# BabuşTV Devir Belgesi

> **Hazırlanma:** 2026-09-15 · **Okuyucu:** projeyi devralacak geliştirici.
> Bu belge sır içermez. Şifre, token, sertifika veya kişisel hesap bilgisi buraya ya da repoya asla yazılmamalı.

## 1. Ürün tek paragrafta

BabuşTV, Samsung Tizen TV için kumanda odaklı, gizlilik öncelikli bir canlı TV uygulamasıdır. Açık kaynak EN TV Player'dan türetilmiş, sonra bağımsız bir mimariye taşınmıştır. Xtream ve M3U sağlayıcılarını, Ana Sayfa'yı, kanal rehberini (EPG), favorileri, aramayı ve telefonla şifreli sağlayıcı eklemeyi destekler. Hesap sistemi ve bulut senkronizasyonu yoktur.

## 2. Bugünkü durum

| Alan | Durum |
| --- | --- |
| V1 kapsamı (M0–M7) | Kod olarak tamamlandı ve `main`'de |
| Tarayıcı sürüm adayı testleri | 76/76 senaryo geçiyor (`tools/rc-browser/`) |
| Son sürüm adayı paketi | `1.0.0-rc.2` (etiket `v1.0.0-rc.2`). Telefonla eşleştirme ve rc.2 sonrası düzeltmeler bu pakette **yok** |
| Sıradaki paket | `1.0.0-rc.3` henüz üretilmedi (sahibin kararı: paket en sona) |
| Telefonla eşleştirme relay'i | Yayında: `https://babustv-pairing-relay.babustv.workers.dev`. Masaüstü tarayıcıda uçtan uca doğrulandı |
| Gerçek Samsung TV kabulü | **Yapılmadı.** 14 madde `PENDING`/`DEFERRED` ([hazırlık panosu](docs/verification/v1-rc-readiness.md#physical-tizen-evidence-debt)) |
| `1.0.0` final sürüm | Fiziksel TV kabulü tamamlanmadan ilan edilemez |

Güncel ve ayrıntılı durum için tek kaynak: [`docs/verification/v1-rc-readiness.md`](docs/verification/v1-rc-readiness.md). Değişiklik geçmişi: [`CHANGELOG.md`](CHANGELOG.md).

## 3. Önce bunları okuyun

1. [`AGENTS.md`](AGENTS.md): çalışma kuralları, repo haritası ve doğrulama komutları. Kurallar zorunludur.
2. [`docs/REPO_RULES.md`](docs/REPO_RULES.md): dal türleri, PR ve commit düzeni.
3. [V1 ürün ve mimari tasarımı](docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md) ve [RC kapsamı](docs/superpowers/specs/2026-09-10-babustv-v1-rc-scope.md).
4. Kararlar: [ADR 0001](docs/decisions/0001-controlled-upstream-divergence.md) (upstream), [ADR 0002](docs/decisions/0002-tizen-credential-storage.md) (kimlik bilgisi deposu), [ADR 0003](docs/decisions/0003-pairing-relay-hosting.md) (relay barındırma).
5. [`docs/SECURITY.md`](docs/SECURITY.md) ve [`docs/TELEMETRY.md`](docs/TELEMETRY.md).

"Historical record" ya da "Inherited" notu taşıyan belgeler geçmiş kayıttır; içlerindeki durum satırlarını güncel sanmayın.

## 4. Hesaplar ve sahiplik

Bu hesapların hepsi şu an **eski sahibe** ait. Devir için her biri ayrı ele alınmalı.

| Varlık | Bugün | Devralırken yapılacak |
| --- | --- | --- |
| GitHub reposu `eyildirim82/babu-TV` (herkese açık) | Sahibin kişisel hesabı | Repo devri (Settings → Transfer) veya yeni bakımcıyı yetkili ekleme. Repo yolu değişirse `player/src/update.js` içindeki `VERSION_URL` (jsDelivr) ve `version.json` içindeki `url` güncellenmeli |
| Cloudflare Worker `babustv-pairing-relay` (`babustv.workers.dev`) | Sahibin kişisel Cloudflare hesabı, ücretsiz plan | İki yol: sahip, yeni bakımcıyı Cloudflare hesabına üye ekler, **veya** yeni bakımcı relay'i kendi hesabına kurar ([`relay-cloudflare/README.md`](relay-cloudflare/README.md)), `player/public/pairing-config.js` adreslerini günceller ve yeni TV paketi yayınlar. Eski relay, eski paketleri kullananlar için bir süre açık kalmalı |
| Samsung imzalama sertifikaları (Tizen profili `samsung`) | Sahibin kişisel yazar ve dağıtıcı sertifikaları, sahibin bilgisayarında | Devredilmez. Yeni bakımcı kendi Samsung sertifikalarını oluşturmalı. **Doğrulanmalı:** farklı yazar sertifikasıyla imzalanan paket, eski imzalı kurulumun üzerine güncelleme olarak kurulmayabilir |
| GitGuardian, GitHub Actions | Repoya bağlı | Repo devriyle birlikte gözden geçirilmeli |

Wrangler (Cloudflare CLI) oturumu sahibin bilgisayarında kapatıldı. Yeniden yayın için `npx wrangler login` gerekir.

## 5. Geliştirme ortamı

- Node.js 22+, npm. Kök dizinde `npm ci`.
- Tarayıcıda geliştirme: `npm run dev` → `http://localhost:5173/babustv/`. Tizen API'leri tarayıcıda yoktur; sağlayıcı eklemeyi denemek için WidgetData taklidi gerekir (rc-browser test yardımcıları bunu yapar).
- Tizen Studio kurulumu ve Windows'ta yaşanan SDK sorunları: [`SETUP.md`](SETUP.md).
- **Windows notu:** `core.autocrlf=true` olan checkout'larda 4 kaynak-metin testi yalnızca CRLF yüzünden başarısız olur. Tüm zinciri LF bir worktree'de çalıştırın (`git -c core.autocrlf=false worktree add ...`). Kısmi bir düzeltme taslak PR #149'da.

## 6. Doğrulama ve CI

Her değişiklikte:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run relay:build
npm run brand:check
node tools/check-m7-security-privacy.mjs
```

`relay/` veya `relay-cloudflare/` değişirse ayrıca `relay-cloudflare/` içinde `npm ci && npm run typecheck && npm test && npm run build`.

| CI iş akışı | Ne zaman çalışır | Ne yapar |
| --- | --- | --- |
| `verify` | Her PR ve `main`'e push | Testler, typecheck, player ve relay derlemesi |
| `relay-cloudflare` | `relay/`, `relay-cloudflare/`, `player/` veya kök paket dosyaları değişince | Workers çalışma ortamı testleri (hesapsız), Wrangler deneme paketi |
| `rc-browser` | Yalnızca `verification/v1-rc-browser*` ve `verification/rc-browser-qualify/**` dallarına push | 1920×1080 tarayıcı sürüm adayı nitelendirmesi |
| GitGuardian | PR'larda | Sır taraması. `tools/rc-browser/fixtures/common.mjs` içindeki sentetik şifre bilerek yakalatılan bir kanaryadır |

Yerel rc-browser çalıştırmak için Playwright Chromium gerekir; indirme sorun çıkarırsa önbellekteki Chrome ile geçici bir yapılandırma kullanılabilir.

## 7. Sürüm çıkarma (RC-PACKAGE)

Önceki adaylar bu adımlarla üretildi; kanıt kayıtları: [`docs/verification/rc-package-execution.md`](docs/verification/rc-package-execution.md), [`docs/verification/rc-package-rc2-execution.md`](docs/verification/rc-package-rc2-execution.md).

1. Kök `package.json` sürümünü yükseltin (örn. `1.0.0-rc.3`); `version.json` ve `CHANGELOG.md` ile uyumlu tutun.
2. Tam doğrulama zinciri + rc-browser nitelendirmesi.
3. `npm run tizen:build`. `tizen/build/` içindeki staged çıktı mutlak yol içermemeli; betik bunu kontrol eder.
4. `TIZEN_PROFILE=<profil> npm run tizen:package`. İmzalama kişisel sertifika kullanır; profil yoksa betik durur.
5. Paket SHA-256 değerini kayda geçirin, sürümü etiketleyin (`v1.0.0-rc.N`).
6. Gerçek TV'de kabul testleri (bölüm 9).

Tizen widget sürümü sayısal `x.y.z` olur (rc.1 ve rc.2'nin ikisi de `1.0.0`). Aynı sürüm numarasıyla üst üste kurulum davranışı fiziksel cihazda doğrulanmadı.

## 8. Telefonla eşleştirme relay'inin işletimi

- Kod: [`relay/`](relay/README.md) (çekirdek + Node sunucusu) ve [`relay-cloudflare/`](relay-cloudflare/README.md) (Worker + tek Durable Object, tüm durum bellekte).
- Yayına alma ve geri alma: `relay-cloudflare/README.md` → "Deploying". Geri alma: `npx wrangler rollback`; tamamen silme: `npx wrangler delete`.
- Relay ana adresi (`/`) bilerek 404 döner; telefon sayfası `/babustv/`, API `/v1/pairing/sessions`.
- İzleme: bilerek istek logu yoktur. Sorun şüphesinde canlı kontrol: `curl -i -X OPTIONS https://babustv-pairing-relay.babustv.workers.dev/v1/pairing/sessions` → `204`.
- Kabul edilmiş riskler: tek bir istemci ücretsiz planın günlük istek kotasını (100.000) bitirebilir; çok adresli saldırgan bellek sınırlarını doldurabilir. Gerekirse Cloudflare WAF kuralı veya ücretli plan.
- Doğrulanmadı: Cloudflare panelinde Observability ayarının kapalı göründüğü (yapılandırmada kapalı).

## 9. Bekleyen işler (öncelik sırasıyla)

1. **`1.0.0-rc.3` paketi**: #142–#146'yı içeren ilk paket.
2. **Fiziksel TV kabulü**: hazırlık panosundaki 14 madde, özellikle WidgetData kalıcılığı, gerçek kumanda tuşları, AVPlay yedeği, yaşam döngüsü ve telefonla eşleştirme.
3. **Taslak PR #148**: Tizen Studio 6.1'in gerçek TV'ye kurulumda çöktüğü duruma karşı `sdb` yedek yolu. Fiziksel TV'ye kurulum için büyük ihtimalle gerekli; TV'de denenmeden birleştirilmemeli.
4. **Taslak PR #149**: Windows CRLF test düzeltmesi (kısmi). Alternatif: repo geneli `.gitattributes`.
5. Açık ürün kararı: telefon sayfasında relay HTTP 500 hatası şu an "ağ hatası" metniyle gösteriliyor.
6. İsteğe bağlı: relay ana adresine kısa bir bilgi sayfası.
6a. Dalgalı test: `player/test-ts/search-core.test.ts` içindeki 10.000 kanallık arama testi 500 ms sınırı koyar; yoğun Windows makinelerinde (başka testler aynı anda çalışırken) iki kez 825 ve 1600 ms ile aştı, tek başına her seferinde geçti. Sınır CI için makul; yerelde tekrar çalıştırın ya da sınırı ortam değişkeniyle esnetmeyi değerlendirin.
7. Ürün fikirleri (V1 dışı, önceliklendirilmedi): Xtream abonelik bitiş tarihini gösterme (veri zaten alınıyor), kategori gizleme, önceki kanala dönme, ses dili/altyazı seçimi, ebeveyn kilidi, tam TV rehberi, catch-up/VOD.

## 10. Repo temizliği ve yerel artefaktlar

- 2026-09-15'te bitmiş 124 dal GitHub'dan silindi; listesi ve son commit kimlikleri: [`docs/verification/branch-cleanup-2026-09-15.md`](docs/verification/branch-cleanup-2026-09-15.md). PR'ı olan dallar GitHub'daki "Restore branch" ile geri getirilebilir.
- Kalan 61 dal (`verification/*`, `verify/*`, `evidence/*` ve 3 tarihsel belge dalı) CI kanıtıdır; `main`'e birleştirilmez.
- İmzalı rc paketleri hiçbir zaman repoya veya GitHub Releases'e konmadı; yalnızca eski sahibin bilgisayarında tutuldu. Temizlik sırasında imzalı rc.2 paketi yanlışlıkla silindi (ayrıntı temizlik kaydında). rc.1 paketi korunuyor. rc.2 gerekirse `v1.0.0-rc.2` etiketinden yeniden üretilebilir, ama rc.3 onun yerini alacak.

## 11. Devir kontrol listesi

- [ ] GitHub reposu devredildi veya yeni bakımcı yetkilendirildi
- [ ] Repo yolu değiştiyse `player/src/update.js` ve `version.json` güncellendi
- [ ] Cloudflare relay için yol seçildi (hesap üyeliği veya yeni hesaba kurulum) ve `pairing-config.js` doğru adresi gösteriyor
- [ ] Yeni bakımcının Samsung sertifikaları hazır; imza değişikliğinin güncelleme etkisi test edildi
- [ ] Yeni bakımcı tam doğrulama zincirini kendi makinesinde yeşil çalıştırdı
- [ ] Taslak PR #148 ve #149 için karar verildi
- [ ] `1.0.0-rc.3` üretildi ve fiziksel TV kabul planı başlatıldı
