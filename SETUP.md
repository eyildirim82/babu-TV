# Tizen TV geliştirme ortamı

Windows 11 üzerinde, GUI kullanmadan kurulan Samsung Tizen TV geliştirme ortamı.
Hedef: uygulamayı `.wgt` olarak paketleyip TV emülatörüne atmak.

## Ne nereye kuruldu

| Bileşen | Yol | Sürüm |
| --- | --- | --- |
| Tizen Studio (Web CLI) | `C:\tizen-studio` | 6.1 |
| SDK verisi, keystore, profil | `C:\tizen-studio-data` | — |
| Gömülü JDK (SDK ile gelir) | `C:\tizen-studio\jdk` | Corretto 1.8.0_242 |
| JDK 8 yedek kopyası | `C:\tizen-studio-jdk8` | Corretto 1.8.0_242 |
| Tizen CLI | `C:\tizen-studio\tools\ide\bin\tizen.bat` | 2.5.25 |
| sdb | `C:\tizen-studio\tools\sdb.exe` | 4.2.25 |
| Emülatör yöneticisi | `C:\tizen-studio\tools\emulator\bin\em-cli.bat` | 3.1.3 |
| Samsung TV platformu | `tv-samsung-10.0-x86_64` | 10.0 |
| Emülatör örneği | `tv-emu` (HD1080 TV, 1920x1080) | — |

Installer resmi kaynaktan indirildi:
`https://download.tizen.org/sdk/Installer/tizen-studio_6.1/web-cli_Tizen_Studio_6.1_windows-64.exe`

Kullanıcı PATH'ine eklenenler:

```
C:\tizen-studio\tools\ide\bin
C:\tizen-studio\tools
C:\tizen-studio\package-manager
C:\tizen-studio\tools\emulator\bin
```

Önceki PATH değeri yedeklendi. Mevcut 10 girdi korundu, 4 girdi eklendi.

## Sanallaştırma

İşlemci Intel i7-1260P. Makinede `VirtualMachinePlatform` ve WSL zaten açık, yani
bir hipervizör çalışıyor. HAXM aktif hipervizörle bir arada çalışamaz, kurulumu
reddeder, ayrıca Intel HAXM'i sonlandırdı ve Alder Lake hibrit çekirdeklerde
sorunlu. Bu yüzden **Hyper-V tabanlı Windows Hypervisor Platform (WHPX)** seçildi.

Açma komutu (yönetici gerekir):

```
dism /online /enable-feature /featurename:HypervisorPlatform /all /norestart
```

**Durum: yeniden başlatma bekliyor.** Özellik `CbsInstallStateStaged` durumunda,
`InstallState` hâlâ 2. Emülatör WHPX'i "operational" olarak raporluyor ama kesme
enjeksiyonu `c0350005` hatasıyla düşüyor ve emülatör kilitleniyor. Yeniden
başlatmadan sonra tekrar denenmeli.

## Uygulama yapısı

Proje Next.js değil. Vite 6 tabanlı vanilla JS SPA, `shaka-player` kullanıyor,
npm workspaces ile iki paket: `player/` ve `tizen/`.

Statik çıktı `player/dist` altında üretiliyor. Tizen paketi için build
`--base=./` ile çalıştırılıyor, böylece asset yolları göreli oluyor ve `.wgt`
kendi kökünden servis edebiliyor. Normal browser development base'i `/babustv/`.

## Uygulama kimliği

`tizen/config.xml` içinde:

- Paket: `BabusTVApp` (Samsung kuralı gereği tam 10 karakter)
- Uygulama kimliği: `BabusTVApp.BabusTV`
- Ad: `BABUŞ TV`
- Privilege'lar: `internet`, `tv.inputdevice`, `widgetdata`

Canonical identity `tizen/config.xml` ve `tizen/product-identity.mjs` tarafından tanımlanır. Packaging sırasında farklı bir uygulama kimliği üretilmez.

## Komutlar

```
npm run tizen:build      # vite build --base=./ ve tizen/build içine staging
npm run tizen:package    # tizen package -t wgt -s dev
npm run tizen:emu        # build + package + sdb'den hedef seç + install + run
npm run tizen:log        # sdb dlog, uygulama ve web çalışma zamanı filtreli
```

Custom packaging hattı için:

```
npm run build
npm run tizen
```

Her iki packaging hattında artifact adı branch'e göre `babustv_stable_v<version>_<commit>.wgt` veya `babustv_beta_v<version>_<commit>.wgt` biçimindedir.

Emülatör yönetimi:

```
em-cli list-vm
em-cli launch -n tv-emu
em-cli detail -n tv-emu
sdb devices
```

Tarayıcıda hızlı test (Tizen API'leri çalışmaz, arayüz ve oynatıcı çalışır):

```
npm run dev -w player
```

Adres: `http://localhost:5173/babustv/`

## Sertifika

`dev` adlı güvenlik profili aktif. Yazar sertifikası Tizen Developers CA ile
imzalı, dağıtıcı sertifikası SDK'nın kendi public signer'ı.

- Yazar sertifikası: `C:\tizen-studio-data\keystore\author\dev.p12`
- Profil: `C:\tizen-studio-data\profile\profiles.xml`
- **Geçerlilik: 27 Aralık 2026.** Tizen Developers CA 1 Ocak 2027'de dolduğu için
  daha uzun süre verilemedi. O tarihten sonra sertifika yeniden üretilmeli.

Bu profil sadece emülatör ve geliştirme içindir. Gerçek Samsung TV'ye mağaza
dağıtımı için Samsung'un kendi sertifika uzantısıyla üretilmiş sertifika gerekir.

## Bilinen sınırlar

**DRM yok.** Emülatörde Widevine ve PlayReady çalışmaz. Şifreli akışlar test
edilemez, sadece açık HLS ve DASH.

**Bazı webapis'ler emülatörde yok.** Gerçek yayın alma, HDMI girişleri, tuner,
bazı `tizen.tvinputdevice` tuşları ve üretici özel API'leri emülatörde ya yok ya
da sahte veri döndürür.

**Donanım hızlandırma kırılgan.** Yukarıdaki WHPX kesme sorunu çözülene kadar
emülatör kilitlenebilir.

**Performans gerçeği yansıtmaz.** Emülatör masaüstü CPU ve GPU kullanır. Gerçek
TV donanımı çok daha yavaştır. Akıcılık kararlarını emülatöre bakarak verme.

**Packaging hatları aynı canonical identity'ye bağlıdır.** `tizen/package.mjs`
custom OpenSSL/Python akışında canonical `tizen/config.xml` dosyasını okur ve
yalnız widget version attribute'unu root package version ile günceller.
`tizen/stage.mjs` + `tizen/wgt.mjs` official Tizen CLI hattı da aynı manifesti
ve aynı artifact adlandırmasını kullanır.

**Storage / upgrade gate.** Tizen package veya application identity değişikliği
IndexedDB/storage origin ve credential erişimini etkileyebilir. Desteklenen
kurulu bir kimlikten farklı kimliğe otomatik migration bu görevde yapılmaz;
böyle bir upgrade hedefi varsa ayrıca onaylanmış migration tasarımı gerekir.

## Aşılan SDK hataları

Tizen Studio 6.1'in Windows sürümünde üç ayrı hata çıktı. Hepsi elle çözüldü.
Bunları bilmek, ileride bir şey bozulduğunda zaman kazandırır.

**1. Paket yöneticisi hiçbir paketi kuramıyor.** `package-manager-cli install`
her pakette `org.tizen.manager.exception.UMException` verip çöküyor ve çökerken
yarım kalan paketin dosyalarını siliyor. `tools/ide` ve gömülü JDK dahil. Java
sürümü, proxy ayarı, uzun yol desteği, antivirüs ve depo bütünlüğü elendi, hiçbiri
sebep değil.

Çözüm: TV SDK paketleri elle kuruldu. Tizen paketleri düz zip dosyaları ve
içlerindeki `data/` ağacı doğrudan SDK köküne eşleniyor. Depo indeksinden
bağımlılık kapanışı çözülüp 35 paket indirildi, SHA256 doğrulandı, açıldı ve
`.info` kayıtları yazıldı. Toplam 1.19 GB. Kullanılan script:
`<scratchpad>/tvinstall.py`.

Paket yöneticisiyle tekrar `install` çalıştırma. Kurulumu bozar.

**2. `tizen certificate` çalışmıyor.** `Failed to create author certificate`
veriyor, başka detay yok.

Çözüm: sertifika OpenSSL ile üretildi ve SDK'nın kendi Tizen Developers CA'sıyla
imzalandı. CA anahtarı ve parolası SDK içinde açıkça duruyor
(`tools\certificate-generator\certificates\developer\conf.ini`).

**3. `tizen security-profiles add` çöküyor.** `SigningProfile` sınıfı hem yazarken
hem okurken `NullPointerException` atıyor. Sebep, parola şifreleyici
`wincrypt.exe` ile onu çağıran Java kodu arasındaki sürüm uyumsuzluğu.

Çözüm: `profiles.xml` elle yazıldı. Biçim şu: `profiles` kökü `active` ve
`version="3.1"`, içinde `profile name`, onun içinde `profileitem` öğeleri.
Öznitelikler `author`, `ca`, `distributor`, `key`, `password`, `rootca`.
Parola alanı ya bir `.pwd` dosyasının yolu ya da satır içi şifreli metin olabilir.
Satır içi biçim seçildi. Boş bir `distributor="2"` öğesi eklenmemeli, okuyucu
onda çöküyor. Yazar öğesinde `author="true"` olmalı.

## Güvenlik notları

`C:\tizen-studio-data\cli\logs\cli.log` dosyası, `tizen certificate` komutuna
verilen parolayı düz metin olarak yazıyor. Sertifika kurulduktan sonra bu log
temizlenmeli.

`profiles.xml` içindeki şifreli parolalar sabit anahtarlı DES ile üretiliyor ve
anahtar SDK jar'ının içinde. Yani SDK'sı olan herkes geri çevirebilir. Bu koruma
göstermeliktir, gerçek bir sır saklamaz. Sertifika parolası olarak başka yerde
kullandığın bir parolayı verme.
