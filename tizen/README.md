# Tizen OS Build — BabuşTV

> Genel proje ve doğrulama komutları için [ana README](../README.md) dosyasına bakın.

Bu dizin BabuşTV web uygulamasını Samsung Tizen TV'lere kurulabilen `.wgt` paketine dönüştüren iki desteklenen packaging yolunu içerir. Her iki yol da canonical Tizen kimliğini ve aynı artifact adlandırma kuralını kullanır.

## Canonical identity

`tizen/config.xml` source of truth'tır:

- widget: `https://babus.tv/babustvapp`
- package: `BabusTVApp`
- application: `BabusTVApp.BabusTV`
- display name: `BABUŞ TV`
- required Tizen version: `5.0`
- privileges: `internet`, `tv.inputdevice`, `widgetdata`

Artifact adları:

```text
babustv_stable_v<version>_<commit>.wgt
babustv_beta_v<version>_<commit>.wgt
```

`main` stable, diğer branch'ler beta kanalı üretir. Version root `package.json` dosyasından, commit ise kısa Git SHA'dan alınır.

## Custom packaging

### Gereksinimler

1. Node.js ve npm
2. Python 3
3. OpenSSL
4. Fiziksel TV kurulumu için Samsung Developer Mode

Project root'tan:

```bash
npm ci
npm run build
npm run tizen
```

`npm run tizen`, `player/dist/` içeriğini geçici package köküne kopyalar, canonical `tizen/config.xml` dosyasındaki yalnız widget `version` attribute'unu root package version ile günceller, `/babustv/` asset base'ini WGT köküne uygun `/` formuna çevirir ve paketi imzalar.

Çıktı:

```text
beta/babustv_beta_v<version>_<commit>.wgt
```

`main` üzerinde aynı dosya `stable/` dizinine `babustv_stable_...` adıyla yazılır.

Custom signer için development certificate yoksa `tizen/package.mjs` OpenSSL ile bir developer certificate üretir. Bu self-signed akış development içindir; mağaza veya cihaz politikası Samsung-issued certificate gerektiriyorsa Tizen Studio certificate akışını kullanın.

## Tizen Studio CLI packaging

Önce uygulamayı stage edin:

```bash
npm run tizen:build
```

Bu komut Vite build'ini Tizen package için relative asset base ile üretip `tizen/build/` altına stage eder ve canonical `config.xml` manifestini kullanır.

Ardından:

```bash
npm run tizen:package
```

`TIZEN_PROFILE` verilmezse `dev` signing profile kullanılır. Tizen CLI exactly one `.wgt` üretmelidir; `tizen/wgt.mjs` bu dosyayı canonical artifact adıyla `tizen/build/` altında yeniden adlandırır.

Feature branch örneği:

```text
tizen/build/babustv_beta_v1.10.1_abc1234.wgt
```

## TV'ye kurulum

Official CLI ile üretilen paket Tizen CLI/sdb akışıyla kurulabilir. Custom physical-TV helper kullanılıyorsa:

```bash
node tizen/install.mjs --ip=<TV_IP_ADDRESS>
```

Developer Mode açık olmalı ve TV ile geliştirme makinesi aynı ağda olmalıdır.

## Dosya yapısı

```text
tizen/
├── README.md
├── config.xml
├── product-identity.mjs
├── package.mjs
├── wgt.mjs
├── stage.mjs
├── install.mjs
├── ziphelper.py
├── icons/
│   └── icon_128.png
├── author-key.pem       # generated, gitignored
├── author-cert.pem      # generated, gitignored
└── build/               # staged official-CLI package output
```

## Storage / upgrade gate

Tizen package/application identity değişikliği storage origin'i ve credential erişimini etkileyebilir. Desteklenen kurulu bir kimlikten farklı kimliğe otomatik migration bu packaging kodunda yapılmaz. Böyle bir upgrade hedefi varsa migration ayrıca tasarlanıp onaylanmadan identity değişikliği Ready/merge yapılmamalıdır.

## Troubleshooting

| Problem | Kontrol |
|---|---|
| `player/dist` yok | Önce `npm run build` çalıştırın |
| OpenSSL bulunamıyor | OpenSSL kurun veya PATH'e ekleyin |
| Python bulunamıyor | Python 3 kurup PATH'e ekleyin |
| Official package imzalanmıyor | `TIZEN_PROFILE` ve Tizen Studio signing profile'ını doğrulayın |
| TV kurulumu başarısız | Developer Mode, ağ erişimi ve Samsung certificate/DUID gereksinimlerini kontrol edin |
