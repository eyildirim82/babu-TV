# BabuşTV B0 Parallel Assignment Prompts

Date: 2026-09-09
Purpose: short copy-paste assignments for parallel worker windows. Canonical scope and implementation details remain in the approved spec/plan.

## Shared worker rule

Every worker must first read:

- `docs/superpowers/specs/2026-09-09-babustv-brand-separation-design.md`
- `docs/superpowers/plans/2026-09-09-babustv-brand-separation.md`
- `docs/verification/b0-execution-status.md`

The implementation plan is the source of truth for task details. Do not silently reinterpret or widen scope when the repository differs from the plan; report the mismatch/blocker.

Workers report execution evidence in their PR body. They do not edit `docs/verification/b0-execution-status.md`.

---

## Window 1 — B0A Product Identity

```text
Repo: eyildirim82/babu-TV
Branch: refactor/b0a-product-identity

Görevin yalnız B0A — Canonical Product Identity & Packaging.

Önce şunları oku:
- docs/superpowers/specs/2026-09-09-babustv-brand-separation-design.md
- docs/superpowers/plans/2026-09-09-babustv-brand-separation.md
- docs/verification/b0-execution-status.md

Plan içindeki Task 1 / B0A bölümünü aynen uygula.

Branch'in REVIEW tarafından kaydedilmiş first-wave GREEN base SHA'dan açıldığını doğrula. Base henüz status dosyasında SET edilmemişse implementation'a başlama; blocker raporla.

Scope ownership: package metadata, package-lock, Vite base, Tizen identity/packaging, product-identity module, first-stage legacy-brand scanner ve active build docs.

Dokunma: player/index.html, presentation CSS, settings-copy işi, Live TV renderer/playback/provider/domain/focus/recovery davranışı.

TDD: RED → minimum implementation → GREEN.
Storage/upgrade gate'i planlandığı gibi uygula; otomatik cross-identity migration tasarlama.

Exact-head test/typecheck/build/brand-check ve mümkünse Tizen package GREEN olmadan tamamlandı deme.
Draft PR aç. PR body'ye base SHA, head SHA, changed files, RED/GREEN evidence, verification ve storage gate sonucunu yaz.
Ready/merge yapma; explicit user checkpoint bekle.
```

---

## Window 2 — B0B Design System

```text
Repo: eyildirim82/babu-TV
Branch: feature/b0b-design-system

Görevin yalnız B0B — BabuşTV Design System Foundation.

Önce spec, implementation plan ve docs/verification/b0-execution-status.md dosyasını oku. Plan içindeki Task 2 / B0B bölümünü uygula.

Branch'in REVIEW tarafından kaydedilmiş first-wave GREEN base SHA'dan açıldığını doğrula. Base henüz SET değilse başlama; blocker raporla.

Yalnız şu yüzeyi sahiplen:
- player/src/ui/tokens.css
- player/src/ui/theme.css
- player/src/ui/primitives.css
- player/test/babustv-design-system.test.js

Shell entegrasyonu, index.html, runtime copy, package/Tizen dosyaları veya playback/provider davranışına girme.

Planın exact token/primitive contractını koru. ENTV inherited red/orange visual DNA taşıma. Focus remote-first ve reduced-motion uyumlu olmalı.

TDD: RED → minimum implementation → GREEN.
Exact-head npm test, typecheck ve build GREEN.
Draft PR aç; base/head, changed files ve RED/GREEN evidence yaz.
Ready/merge yapma; explicit checkpoint bekle.
```

---

## Window 3 — B0C Brand Assets

```text
Repo: eyildirim82/babu-TV
Branch: feature/b0c-brand-assets

Görevin yalnız B0C — BabuşTV Brand Asset Set.

Önce spec, implementation plan ve docs/verification/b0-execution-status.md dosyasını oku. Plan içindeki Task 3 / B0C bölümünü uygula.

Branch'in REVIEW tarafından kaydedilmiş first-wave GREEN base SHA'dan açıldığını doğrula. Base SET değilse başlama; blocker raporla.

Marka yönü: BabuşTV + minimal calico cat + charcoal/violet + premium/restrained TV-first.

Yalnız brand asset dosyaları, favicon/Tizen icon ve asset acceptance testlerini sahiplen. Runtime logic, layout, package identity, localization veya playback/provider koduna dokunma.

Eski TV/play markını, EN/IPTV lettering'i ve inherited red/orange ana kimliği taşıma. Assetler üçüncü taraf lisans belirsiz içerik kullanmamalı.

Önce acceptance test RED, sonra minimum final assets, sonra GREEN. Tizen staging'in yeni iconu gerçekten kullandığını doğrula.

Draft PR aç; base/head, asset listesi, test/build/staging evidence yaz.
Ready/merge yapma; explicit checkpoint bekle.
```

---

## Window 4 — B0F Runtime Copy Cleanup

```text
Repo: eyildirim82/babu-TV
Branch: feature/b0f-settings-copy-cleanup

Görevin yalnız B0F — Turkish-first Runtime Copy Cleanup.

Önce spec, implementation plan ve docs/verification/b0-execution-status.md dosyasını oku. Plan içindeki Task 4 / B0F bölümünü uygula.

Branch'in REVIEW tarafından kaydedilmiş first-wave GREEN base SHA'dan açıldığını doğrula. Base SET değilse başlama; blocker raporla.

Planın exact UI_COPY + copy.d.ts contractını uygula. Runtime-generated settings/action/status/error/dialog copy'yi Türkçeleştir.

Dokunma: player/index.html, layout CSS, Tizen/package metadata, playback/startup/provider/remote/timer/storage semantics.
player.js/main.js içinde yalnız user-visible string değişiklikleri yap.
Static shell English copy B0D'ye aittir; PR body'de Deferred to B0D olarak raporla.

TDD: RED → minimum implementation → GREEN.
Exact-head test/typecheck/build GREEN.
Draft PR aç; base/head, changed files ve evidence yaz.
Ready/merge yapma; explicit checkpoint bekle.
```

---

## Window 5 — M3G Runtime Verification

```text
Repo: eyildirim82/babu-TV
Branch: docs/m3-live-tv-verification

Görevin yalnız M3G — Tizen-sensitive runtime verification/evidence.

Önce:
- docs/superpowers/plans/2026-09-08-m3-live-tv-core.md
- ilgili M3 design/spec
- docs/verification/b0-execution-status.md
oku.

Fresh GREEN main'den çalış. B0 implementation branch'lerine dokunma.

Primary output:
- docs/verification/m3-live-tv-runtime.md

M3 planındaki runtime smoke matrixini gerçek emulator/Tizen koşullarında doğrula. Fiziksel TV gerektiren veya çalıştırılamayan kontrolleri PASS yapma; NOT-AVAILABLE/DEFERRED yaz.

M2 WidgetData runtime probe ayrıca gerçekten doğrulanmadıysa pending olarak bırak.
Synthetic/test provider data kullan; credentials/provider URLs/transient stream URLs loglama veya screenshot'a alma.

Runtime bug bulursan docs branch'inde speculative code fix yapma. Reproduce → root cause → RED gereksinimini raporla; production fix için ayrı feature/m3g-tizen-hardening branch'i gerekir.

Automated baseline ve runtime evidence'i commit SHA ile kaydet.
Docs/evidence-only Draft PR aç.
Ready/merge yapma; explicit checkpoint bekle.
```

---

## Window 6 — REVIEW / Integration Controller

```text
Repo: eyildirim82/babu-TV
Rolün: REVIEW / Integration Controller. Normalde production kod yazma.

Önce şunları oku:
- docs/superpowers/specs/2026-09-09-babustv-brand-separation-design.md
- docs/superpowers/plans/2026-09-09-babustv-brand-separation.md
- docs/verification/b0-execution-status.md
- docs/superpowers/plans/2026-09-08-m3-live-tv-core.md

Sen docs/verification/b0-execution-status.md dosyasının tek sahibisin. Worker'ların PR body evidence'ini ve GitHub branch/PR/CI durumunu okuyup bu status dosyasını yalnız anlamlı checkpoint'lerde güncelle.

İlk görevin:
1. B0 docs branch'ini review et.
2. User merge checkpoint'i olmadan merge/Ready yapma.
3. Docs merge sonrası main'i refresh et.
4. npm ci + test + typecheck + build + tizen:build baseline'ını doğrula.
5. Exact GREEN main SHA'yı status dosyasında First-wave GREEN base SHA olarak kaydet.
6. Ancak bundan sonra B0A/B0B/B0C/B0F worker'larının başlamasına izin ver.

Her worker PR için kontrol et:
- doğru base
- scope/file ownership
- TDD RED/GREEN evidence
- exact-head CI/test/typecheck/build
- secret/provider URL leakage
- playback/provider/domain/focus/recovery regression
- ENTV identity reduction
- divergence/conflict
- changed-file discipline

Critical/Important/Minor ayrımı yap. Minor cleanup'ı blocker yapma.

First-wave development paralel olabilir ama merge'ler tek tek olmalı. Her merge için user explicit approval şart. Merge sonrası main GREEN olmadan sıradaki PR'ı merge checkpoint'ine taşıma.

B0D ancak B0A+B0B+B0C+B0F merge + GREEN sonrası; B0E ancak B0D merge + GREEN sonrası; B0G ancak tüm B0 implementation slice'ları merge + GREEN sonrası başlayabilir.

Bir worker problemi bulursan kendin sessizce fix push etme; ilgili pencereye net düzeltme talimatı üret.
```
