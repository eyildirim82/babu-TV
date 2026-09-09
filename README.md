# 📺 BabuşTV

**Samsung Tizen TV için uzaktan kumanda odaklı IPTV oynatıcı** — HLS/DASH akışlarını, ClearKey ve PlayReady korumalı kanalları destekleyen Vite tabanlı TV uygulaması.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tizen](https://img.shields.io/badge/Tizen-5.0+-red?logo=samsung)]()

> **Current version: v1.10.1** — [CHANGELOG](CHANGELOG.md)

---

## BabuşTV neden var?

Samsung Tizen TV'lerde bazı canlı yayınlar, özellikle DRM korumalı akışlar, genel amaçlı oynatıcılarda güvenilir çalışmayabilir. BabuşTV; TV kumandası, kanal listeleri ve Tizen playback yetenekleri etrafında tasarlanır.

- 🔓 **DRM desteği** — ClearKey ve PlayReady akışları
- 📡 **Sunucusuz kullanım** — M3U/M3U8 playlist URL'si doğrudan eklenebilir
- 📺 **TV odaklı arayüz** — kumanda navigasyonu, kanal grupları ve sayı ile kanal seçimi
- 🎚️ **Kanal bazlı proxy seçeneği** — gerektiğinde belirli akışlar için
- 🔒 **Yerel veri** — ayarlar ve kanal verileri cihazda tutulur
- 🆓 **MIT lisanslı açık kaynak**

---

## Geliştirme

Gereksinimler: güncel Node.js ve npm.

```bash
npm ci
npm run dev
```

Tarayıcı geliştirme adresi:

```text
http://localhost:5173/babustv/
```

Üretim build'i:

```bash
npm run build
```

Doğrulama:

```bash
npm test
npm run typecheck
npm run brand:check
```

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
npm run tizen:package
```

Paket `tizen/build/` altında aynı canonical adlandırmayla bırakılır. Ayrıntılar için [tizen/README.md](tizen/README.md) ve Windows geliştirme ortamı notları için [SETUP.md](SETUP.md) dosyasına bakın.

> Paket/uygulama kimliği değişiklikleri cihaz storage origin'ini etkileyebilir. Desteklenen kurulu bir ürün kimliğinden başka kimliğe otomatik veri taşıma bu repoda yapılmaz; böyle bir upgrade hedefi ayrı, açıkça onaylanmış migration tasarımı gerektirir.

---

## Özellikler

| | |
|---|---|
| 🔓 DRM playback | ClearKey + PlayReady |
| 📃 Playlists | M3U/M3U8, birden fazla kayıtlı playlist |
| 🗂️ Organizasyon | Kanal grupları, sıralama, hızlı sayı ile seçim |
| 🎚️ Proxy | Kanal bazlı proxy seçimi |
| 📶 Playback | Akış formatı algılama ve recovery mekanizmaları |
| 🎮 Remote-first | Samsung kumanda tuşları ve kanal geçişleri |

---

## İlk çalıştırma

1. Uygulamayı kurup açın.
2. Ayarlardan M3U/M3U8 playlist URL'sini ekleyin.
3. Playlist'i yükleyip kanal seçin.

---

## Hata raporu ve katkı

Issue açarken TV modeli, Tizen sürümü, uygulama sürümü ve tekrar üretme adımlarını ekleyin. Mevcut issue'ları önce kontrol edin ve her issue'da tek problemi ele alın.

## License

MIT — see [LICENSE](LICENSE). Mevcut lisans ve repository geçmişi proje provenance'ını korur.
