# 📺 BabuşTV

**Samsung Tizen TV için kumanda odaklı, gizlilik öncelikli canlı TV uygulaması.** Xtream ve M3U sağlayıcılarını destekler; kanal rehberi, favoriler, arama ve telefonla şifreli sağlayıcı ekleme sunar.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tizen](https://img.shields.io/badge/Tizen-5.0+-red?logo=samsung)]()

> **Son sürüm adayı: v1.0.0-rc.2** — [CHANGELOG](CHANGELOG.md). `main` dalında rc.2'den sonra gelen, henüz paketlenmemiş değişiklikler var (telefonla eşleştirme dahil). Gerçek Samsung TV kabul testleri henüz tamamlanmadı; durum için [V1 RC hazırlık panosu](docs/verification/v1-rc-readiness.md).

---

## Neler var

| | |
|---|---|
| 📡 Sağlayıcılar | Xtream (sunucu, kullanıcı adı, şifre) ve M3U/M3U8 playlist; birden fazla sağlayıcı, aynı anda biri aktif |
| 🏠 Ana Sayfa | Sağlayıcı seçimi, Son İzlenen, Canlı TV, Favoriler, Sık İzlenenler, Ayarlar |
| 📺 Canlı TV | Tam ekran yayın, OK ile açılan kategori/kanal/program paneli; gezinmek yayını değiştirmez, OK ile açılır |
| 🗓️ Program rehberi | Şimdiki ve sonraki program, detay; Xtream EPG ve XMLTV |
| ⭐ Favoriler ve arama | Sağlayıcıya özel favoriler; Türkçe karakter uyumlu yerel kanal araması |
| 📱 Telefonla ekle | TV'deki QR kodu telefonla okutulur, sağlayıcı bilgisi telefonda şifrelenip TV'ye gönderilir |
| 🔓 Oynatma | HLS/DASH/TS, ClearKey ve PlayReady; Shaka Player ve Samsung AVPlay yedeği, sınırlı ve sınıflandırılmış yeniden deneme |
| 🎮 Kumanda | Temel çekirdek Yukarı/Aşağı/Sol/Sağ/OK/Geri ile çalışır; CH+/CH- ve numara tuşları destekleniyorsa |
| 🔒 Gizlilik | Hesap yok, bulut senkronizasyonu yok; sağlayıcı şifreleri Samsung WidgetData güvenli deposunda tutulur ve loglanmaz |

Kapsam dışı (V1): film/dizi (VOD), geçmiş yayın (catch-up), hesap sistemi, bulut senkronizasyonu. Ayrıntılar: [V1 ürün ve mimari tasarımı](docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md).

---

## İlk çalıştırma

1. Uygulamayı kurup açın; kısa tanıtım ekranında bir sağlayıcı türü seçin.
2. **Xtream** veya **M3U** kartıyla bilgileri TV klavyesinden girin, ya da
3. **Telefonla Ekle** kartını seçin, ekrandaki QR kodunu telefonunuzla okutun ve bilgileri telefonda girin.
4. Kanallar yüklenince Ana Sayfa açılır.

## Telefonla eşleştirme nasıl korunur

- TV her eşleştirme için tek kullanımlık bir anahtar üretir; QR kodunda yalnızca oturum bilgisi ve TV'nin açık anahtarı bulunur, sağlayıcı bilgisi bulunmaz.
- Telefon, sağlayıcı bilgisini tarayıcıda TV'nin anahtarıyla şifreler (ECDH P-256 + AES-GCM).
- Arada çalışan **relay** yalnızca şifreli veriyi taşır; çözemez, sağlayıcıya bağlanmaz, istek içeriğini loglamaz. Oturum 5 dakika geçerlidir ve tek kez teslim edilir.
- Varsayılan relay BabuşTV'nin Cloudflare üzerindeki servisidir (`babustv-pairing-relay.babustv.workers.dev`). Cloudflare, her web servisinde olduğu gibi bağlanan IP adreslerini kendi altyapısında işler.
- Kendi relay'inizi çalıştırabilirsiniz: [relay/README.md](relay/README.md) (Node, kendi sunucunuz) veya [relay-cloudflare/README.md](relay-cloudflare/README.md) (kendi Cloudflare hesabınız). Adresler [`player/public/pairing-config.js`](player/public/pairing-config.js) dosyasındadır.

---

## Geliştirme

Gereksinimler: Node.js 22 veya üzeri, npm.

```bash
npm ci
npm run dev
```

Tarayıcı geliştirme adresi: `http://localhost:5173/babustv/`

Doğrulama:

```bash
npm test              # player, relay testleri
npm run typecheck
npm run build
npm run relay:build
npm run brand:check
```

Cloudflare relay paketi ayrı kurulur (kök çalışma alanına dahil değildir):

```bash
cd relay-cloudflare
npm ci
npm run typecheck
npm test              # yerel Workers çalışma ortamında, hesap gerekmez
npm run build         # yayına almadan deneme paketi
```

Depo yapısı:

| Klasör | İçerik |
|---|---|
| `player/` | TV uygulaması (Vite, TypeScript + JS) |
| `relay/` | Eşleştirme relay çekirdeği ve Node sunucusu |
| `relay-cloudflare/` | Relay'in Cloudflare Workers + Durable Object dağıtımı |
| `tizen/` | Tizen paketleme araçları |
| `tools/rc-browser/` | Tarayıcı sürüm adayı test paketleri |
| `docs/` | Tasarımlar, kararlar (ADR), planlar ve doğrulama kayıtları |

Katkıda bulunurken önce [AGENTS.md](AGENTS.md) ve [docs/REPO_RULES.md](docs/REPO_RULES.md) dosyalarını okuyun.

---

## Tizen build ve packaging

BabuşTV'nin canonical Tizen kimliği:

- package: `BabusTVApp`
- application: `BabusTVApp.BabusTV`
- display name: `BABUŞ TV`

İki paketleme hattı da aynı kimliği ve artifact adlandırmasını kullanır.

### Custom packaging

```bash
npm run build
npm run tizen
```

Feature branch çıktısı:

```text
beta/babustv_beta_v<version>_<commit>.wgt
```

`main` çıktısı:

```text
stable/babustv_stable_v<version>_<commit>.wgt
```

### Tizen Studio CLI

```bash
npm run tizen:build
TIZEN_PROFILE=<profil-adı> npm run tizen:package
```

Paket `tizen/build/` altında aynı canonical adlandırmayla bırakılır. Ayrıntılar için [tizen/README.md](tizen/README.md) ve Windows geliştirme ortamı notları için [SETUP.md](SETUP.md) dosyasına bakın.

> Paket/uygulama kimliği değişiklikleri cihaz storage origin'ini etkileyebilir. Desteklenen kurulu bir ürün kimliğinden başka kimliğe otomatik veri taşıma bu repoda yapılmaz; böyle bir upgrade hedefi ayrı, açıkça onaylanmış migration tasarımı gerektirir.

---

## Belgeler

- [V1 ürün ve mimari tasarımı](docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md)
- [Devir belgesi](HANDOVER.md)
- [V1 RC hazırlık panosu](docs/verification/v1-rc-readiness.md)
- Kararlar: [ADR 0001 upstream](docs/decisions/0001-controlled-upstream-divergence.md), [ADR 0002 kimlik bilgisi deposu](docs/decisions/0002-tizen-credential-storage.md), [ADR 0003 relay barındırma](docs/decisions/0003-pairing-relay-hosting.md)
- [Güvenlik](docs/SECURITY.md) · [Telemetri](docs/TELEMETRY.md)

## Hata raporu ve katkı

Issue açarken TV modeli, Tizen sürümü, uygulama sürümü ve tekrar üretme adımlarını ekleyin. Sağlayıcı adresi, kullanıcı adı, şifre veya playlist bağlantısı paylaşmayın. Mevcut issue'ları önce kontrol edin ve her issue'da tek problemi ele alın.

## License

MIT — see [LICENSE](LICENSE). BabuşTV, [EN TV Player](docs/UPSTREAM_BASELINE.md) tabanından kontrollü olarak ayrılmış bağımsız bir üründür; lisans ve repository geçmişi proje kökenini korur.
