# BabuşTV B0 Brand Separation Design

Date: 2026-09-09
Status: Design approved in chat; implementation plan not yet written
Milestone: B0 BabuşTV Brand Separation
Base: `main@b35483d0da85e4d73e335387592874759232d304`

## 1. Purpose

B0 makes BabuşTV a distinct product rather than a visibly re-skinned ENTV fork.

The project may continue to reuse upstream technical foundations where they remain useful, but the user-facing product, runtime identity, packaging identity, visual language, copy, assets, and developer-facing package naming must be owned by BabuşTV.

The central invariant is:

> Upstream technical lineage may remain; upstream product identity must not.

B0 deliberately avoids rewriting provider, playback, domain, focus, or recovery logic that already works. It replaces the product and presentation identity around those foundations while preserving behavior and compatibility.

## 2. Product identity

The approved identity is:

- Product name: **BabuşTV**
- TV-facing display form: **BABUŞ TV** where supported
- ASCII-safe platform form: **BabusTV**
- Visual personality: premium, restrained, modern, TV-first
- Primary motif: calico cat identity used selectively rather than as a constant mascot
- Base theme: dark charcoal surfaces
- Accent: violet
- Primary language for user-facing UI: Turkish
- Interaction priority: remote-focus-first, not pointer-hover-first

The visual system must not preserve ENTV's recognizable red/orange IPTV look, TV/play iconography, EN IPTV boot treatment, or inherited presentation hierarchy merely with different colors.

## 3. Scope

### In scope

- product naming and runtime identity
- Tizen application/package/display identity
- WGT artifact naming
- npm workspace/package names
- user-visible copy cleanup and Turkish-first copy
- BabuşTV logo/wordmark/iconography
- calico cat brand asset set
- favicon, Tizen app icon, boot/splash assets
- dark charcoal + violet design tokens
- typography, spacing, surface, radius, focus, status, and motion primitives
- shell visual reset
- Live TV presentation reset without changing M3 behavior
- settings/dialog/empty/error/status copy cleanup
- removal of legacy ENTV brand references from active product code and documentation
- automated legacy-brand regression gate
- packaging verification
- emulator smoke verification
- preservation of legally required upstream attribution and license text

### Out of scope

- M4 EPG behavior
- M4 search behavior
- M4 favorites behavior
- provider protocol changes
- playback engine behavior changes
- ChannelIntentCoordinator behavior changes
- PlayerSessionCoordinator recovery policy changes
- provider credential architecture changes
- IndexedDB schema redesign unrelated to identity continuity
- Home milestone implementation
- pairing
- unrelated refactors
- full TypeScript rewrite

B0 may prepare presentation primitives that later support M4, but must not pull M4 product behavior into the milestone.

## 4. Current legacy identity surfaces

The current tree still contains multiple inherited product-identity surfaces, including:

- `IPTV Player` page title
- `IPTV` sidebar branding
- `EN IPTV` boot branding
- red/orange `#ED421F` primary visual accent
- inherited TV/play logo mark
- English loading/settings/action copy
- legacy WGT names such as `EN-IPTV_Player_...wgt`
- legacy package/application identity such as `IPTVPlayer`
- workspace names such as `@en-iptv/player` and `@en-iptv/tizen`
- packaging and README examples that still reference EN-IPTV artifacts

The recent emulator/CLI work also introduced a second identity path using `BabusTVApp.BabusTV`, while the older custom packager can still generate inherited `IPTVPlayer` identity. B0 must remove this split-brain packaging behavior.

## 5. Brand separation boundary

B0 owns product identity and presentation, not core playback/provider behavior.

The intended boundary is:

```text
Provider / Domain / Playback / Focus / Recovery
                    |
                    | behavior preserved
                    v
          Presentation contracts
                    |
                    v
              BabuşTV UI
```

B0 must not move provider endpoints, stream URLs, Tizen AVPlay calls, or playback coordination into UI code.

Existing architectural rules remain mandatory:

- provider access stays behind provider adapters/repositories
- playback access stays behind playback boundaries
- Tizen APIs stay behind platform boundaries where already established
- secrets are never exposed in UI, logs, tests, screenshots, or docs
- focus remains application state, not incidental browser focus
- highlight remains distinct from playback

## 6. Canonical naming rules

B0 establishes one canonical product identity.

### User-facing name

Use `BabuşTV` in normal product copy.

Use `BABUŞ TV` for the TV application display name where the target field safely supports Unicode. Use `BabusTV` only where an ASCII-safe identifier is required.

### npm package namespace

Canonical package names are:

- `@babustv/player`
- `@babustv/tizen`

The root lockfile must be regenerated so no active workspace linkage depends on `@en-iptv/*`.

### WGT artifact naming

Canonical artifact names are:

```text
babustv_stable_v<version>_<commit>.wgt
babustv_beta_v<version>_<commit>.wgt
```

`<commit>` is the existing short-commit convention used by the packaging pipeline. Scripts, docs, and CI must all use this same format.

### Tizen identity

The desired canonical Tizen identity is:

```text
package:        BabusTVApp
application id: BabusTVApp.BabusTV
display name:   BABUŞ TV
```

All supported Tizen packaging paths must consume one canonical identity definition rather than defining their own unrelated constants.

The legacy custom packaging path must not continue generating `IPTVPlayer` while the CLI path generates `BabusTVApp.BabusTV`.

However, changing an already-installed application's package/application identity can affect persisted data. Therefore `BabusTVApp.BabusTV` is the target identity, but B0A must first execute the storage-continuity decision in Section 13. If evidence shows that switching an existing installation to this identity would irrecoverably lose user-owned state or credentials and no safe migration is available, B0A must stop and return that product decision for explicit approval rather than silently choosing data loss.

## 7. Legacy-brand gate

B0 adds an automated regression check so inherited identity cannot silently re-enter active product surfaces.

At minimum, the gate searches for active references matching concepts such as:

```text
EN-IPTV
EN IPTV
IPTVPlayer
@en-iptv
en-tvplayer
```

The gate must be context-aware enough to permit explicit allowlisted provenance/legal/history locations while failing on active product/runtime/build/package references.

Allowed exceptions may include:

- license files that must preserve upstream copyright
- explicit provenance documentation
- historical migration notes clearly marked as such

Allowed exceptions must be narrow and documented. A broad directory-level ignore is not acceptable if active code can hide inside it.

## 8. Visual system

B0 introduces a BabuşTV-owned design system rather than recoloring the inherited stylesheet.

### Color direction

Base direction:

```text
background       deep charcoal
surface          charcoal
surface-raised   slightly lighter charcoal
surface-focus    violet-tinted raised surface
accent           violet
accent-soft      low-opacity violet
text-primary     warm white
text-secondary   neutral gray
text-muted       darker neutral gray
success          green
warning          amber
error            red
```

Representative dark values may begin around:

```text
background       #0B0B0F
surface          #14141A
surface-raised   #1B1B23
surface-focus    #242331
```

Final exact token values belong to implementation validation, but the design direction is fixed: charcoal + violet, not ENTV orange/red.

### Typography

- optimized for 10-foot viewing distance
- high legibility at 1080p
- restrained weight hierarchy
- avoid decorative display fonts in playback-critical surfaces
- no dependency that jeopardizes offline/Tizen startup

### Focus

Remote focus is a first-class visual state.

Focused elements must be recognizable without hover and without relying solely on color.

Preferred treatment:

- clear outline or border
- subtle violet glow or elevation
- sufficient contrast
- stable layout without large zoom jumps

`focused`, `active`, and `playing` are semantically distinct states and must remain visually distinguishable.

### Surfaces

Use moderate radius and controlled elevation. Avoid a generic mobile-card aesthetic and avoid excessive glassmorphism.

### Motion

Motion is restrained and functional.

Typical transition range: approximately 120–220 ms.

Avoid:

- bounce animation
- large scale transforms on focus
- expensive full-screen blur
- long decorative startup animation
- animation that makes rapid remote navigation feel delayed

Tizen performance takes precedence over decorative effects.

## 9. Calico cat usage

The calico identity is a brand signature, not a persistent on-screen mascot.

Appropriate surfaces include:

- boot/splash
- app icon
- first-run/onboarding surfaces
- empty states
- carefully selected success/error states
- brand documentation

It should normally not remain visible over active video playback or compete with channel/program information.

The brand asset set should support at least:

- primary BabuşTV wordmark
- compact calico mark
- square app icon treatment
- monochrome/simplified fallback where platform constraints require it
- boot/splash composition

Assets must be owned by this project or otherwise licensed for the intended use.

## 10. Shell presentation

The inherited visible shell is replaced with BabuşTV presentation.

### Boot

The inherited TV/play mark, `EN IPTV`, and `Updating playlist...` presentation are removed.

The intended boot character is restrained:

```text
[calico mark]  BabuşTV
               <version when useful>

               Hazırlanıyor…
```

Version/debug detail must not dominate normal user startup.

### Primary copy

User-facing core copy becomes Turkish-first, for example:

- `Yükleniyor…`
- `Kanallar`
- `Kategoriler`
- `Ayarlar`
- `Yenile`
- `Yayın açılıyor…`
- `Yayın yenileniyor…`
- `Otomatik`

Copy must be concise enough for TV surfaces and long channel names.

### Right-side actions/settings

Inherited action labels and proxy/debug-oriented copy should be reviewed individually. Developer-oriented controls must not look like primary consumer UI if they remain necessary.

## 11. Live TV presentation

B0 does not change M3 Live TV behavioral invariants.

The following remain unchanged:

- highlight is not playback
- SELECT explicitly starts highlighted channel
- CH+/CH- operates in active scope
- last intent wins
- stale intents do not take over playback
- single-session recovery remains bounded
- failed target behavior preserves/restores previous playback when possible
- Back remains layer-owned

The presentation should evolve toward a BabuşTV-native TV overlay capable of accommodating future M4 data without implementing M4 itself.

Conceptual direction:

```text
+------------------------------------------------------------+
|                                                            |
|                       LIVE VIDEO                           |
|                                                            |
|   +------------- BabuşTV Live TV ----------------------+   |
|   | Categories   | Channels                            |   |
|   |              |                                     |   |
|   | Haber        |  1  TRT 1                           |   |
|   | Spor         |  2  TRT Spor                        |   |
|   | Sinema       |  3  ...                             |   |
|   +----------------------------------------------------+   |
|                                                            |
|   Channel / status area                 future EPG slot    |
+------------------------------------------------------------+
```

The exact M4 current/next program treatment remains out of scope, but B0 should avoid locking the layout into an inherited sidebar structure that cannot accommodate it cleanly.

## 12. CSS and presentation structure

Do not perform a blind global color/string replacement in the inherited `styles.css`.

Introduce an explicit BabuşTV presentation foundation, expected to evolve toward a structure such as:

```text
player/src/ui/
  tokens.css
  theme.css
  primitives.css
  components/
```

The implementation plan may adjust exact file names, but the architectural rule is fixed:

> New BabuşTV visual primitives are introduced deliberately, and inherited CSS is retired incrementally.

This reduces the chance of carrying ENTV visual DNA forward accidentally.

## 13. Storage continuity and application identity

Tizen application/package identity changes may affect persisted application storage and credential availability.

B0 must not change identity purely for branding and silently discard user state.

Before finalizing the target `BabusTVApp.BabusTV` identity, implementation must determine the effect on at least:

- IndexedDB provider/category/channel/app state
- local legacy settings still intentionally supported during migration
- secure WidgetData credential access
- application update/install behavior

The preferred outcome is `BabusTVApp.BabusTV` with continuity preserved.

If continuity cannot be preserved automatically, B0A must stop before destructive identity migration and present evidence. The allowed follow-up decisions are:

1. preserve the existing installed identity internally while changing all user-visible identity, or
2. implement a documented migration path with evidence, or
3. treat identity change as a breaking reinstall only after explicit product approval.

Option 3 is never implicit.

No implementation branch may assume storage continuity without a test or platform-specific evidence.

## 14. Legal attribution and provenance

Brand separation does not mean deleting legally required upstream notices.

B0 must preserve:

- required license text
- required copyright notices
- legally necessary third-party attribution

These may be isolated into appropriate license/provenance files and do not need to appear as product branding in normal UI.

Historical design/baseline documents may retain inherited names where necessary to accurately describe prior state, provided the legacy-brand gate explicitly allowlists those locations or contexts.

The project must not rewrite history in a way that makes provenance misleading.

## 15. Branch and PR decomposition

### B0 design

Branch:

`docs/b0-babustv-brand-separation`

Owns this design and, after design review, the implementation plan only.

### B0A — Product identity

Branch:

`refactor/b0a-product-identity`

Primary scope:

- canonical product/package naming
- npm workspace rename
- lockfile update
- WGT naming
- Tizen identity unification
- packaging-path convergence
- active docs/build naming cleanup
- legacy-brand regression gate
- storage-continuity decision/tests required by identity changes

Avoid visual redesign beyond identity strings/assets needed for packaging.

### B0B — Design system

Branch:

`feature/b0b-design-system`

Primary scope:

- tokens
- theme
- typography
- spacing/radius
- focus primitives
- surface/status/motion primitives

Must not own packaging or playback behavior.

### B0C — Brand assets

Branch:

`feature/b0c-brand-assets`

Primary scope:

- wordmark
- calico mark
- favicon
- Tizen icon
- boot/splash assets
- removal/replacement of inherited TV/play visual assets

Must not redesign application behavior.

### First parallel wave

B0A, B0B, and B0C may run in parallel after this spec and its plan are merged, provided they stay within their file boundaries.

### B0D — Shell rebrand

Branch:

`feature/b0d-shell-rebrand`

Depends on B0B and B0C.

Primary scope:

- boot presentation
- shell
- primary panels
- base Turkish copy
- application-level brand surfaces

### B0E — Live TV visual reset

Branch:

`feature/b0e-live-tv-visual-reset`

Depends on B0B and preferably B0D.

Primary scope:

- Live TV overlay presentation
- category/channel visual hierarchy
- focus/active/playing representation
- loading/status/toast visual reset

Must preserve M3 state and playback behavior.

### B0F — Settings and copy cleanup

Branch:

`feature/b0f-settings-copy-cleanup`

Primary scope:

- settings
- dialogs
- What's New surface if retained
- consumer-facing action/error/status copy
- remaining inherited terminology

May run partly in parallel with B0D if file ownership is explicitly separated.

### B0G — Brand hardening

Branch:

`feature/b0g-brand-hardening`

Final scope:

- repository-wide legacy-brand audit
- packaging consistency
- asset/copy regressions
- full test suite
- typecheck
- production build
- WGT build/package
- emulator smoke evidence
- documentation of allowed provenance exceptions

## 16. Parallel-development conflict rules

The following files/surfaces are likely merge-conflict hotspots:

```text
player/index.html
player/src/styles.css
player/src/main.js
tizen/package.mjs
tizen/config.xml
package-lock.json
```

Parallel branches must not casually co-own these files.

Recommended ownership:

- B0A owns packaging identities, package manifests, lockfile, and identity-related docs
- B0B owns new design-system files and minimal stylesheet wiring
- B0C owns asset files and asset metadata
- B0D/B0E are sequenced after the foundations and own high-conflict presentation files

If a supposedly independent branch discovers it must substantially edit another branch's owned hotspot, stop and re-sequence rather than create a large cross-branch merge burden.

## 17. Test strategy

B0 follows the project rule:

> RED -> minimum implementation -> GREEN

### B0A tests

At minimum verify:

- canonical Tizen identity contract
- legacy and CLI packaging paths produce BabuşTV identity
- WGT artifact name contract
- npm workspace names
- legacy-brand gate
- no accidental credential/secret output
- storage continuity behavior relevant to any identity change

### B0B tests

At minimum verify:

- required design token contract
- stylesheet loading contract
- focus primitive presence/semantics where practical
- no dependence on unsupported modern-only runtime features without fallback

### B0C tests

At minimum verify:

- required asset presence
- Tizen package references valid assets
- build/package includes required icons/assets

### B0D/B0E/B0F tests

At minimum verify:

- presentation/copy contracts
- focus classes and visible layer contracts
- existing M3 behavioral tests remain unchanged and GREEN
- UI changes do not directly start playback
- UI changes do not bypass provider/playback/platform boundaries

### B0G verification

Run the full repository gates, including the project's normal legacy and TypeScript test suites, typecheck, production build, clean-diff checks where applicable, and Tizen package verification.

Emulator smoke should cover at least:

1. app identifies as BabuşTV
2. BabuşTV boot surface appears
3. no visible ENTV/EN-IPTV/IPTVPlayer branding
4. remote focus is clearly visible
5. Live TV overlay opens
6. navigation remains deterministic
7. SELECT behavior remains explicit
8. playback path remains functional for emulator-supported clear streams
9. Back behavior remains correct
10. settings/dialog surfaces use BabuşTV identity/copy

Emulator evidence is not equivalent to physical-TV release acceptance.

## 18. Acceptance criteria

B0 is complete when all of the following are true:

- the application is visibly and technically branded as BabuşTV
- the inherited ENTV visual language is no longer recognizable as the active UI system
- active WGT artifacts use `babustv_{stable|beta}_v<version>_<commit>.wgt`
- supported Tizen packaging paths use one canonical BabuşTV identity source
- active npm workspaces are `@babustv/player` and `@babustv/tizen`
- no user-facing `EN IPTV`, `EN-IPTV`, `IPTVPlayer`, or equivalent inherited product branding remains
- legacy-brand regression scanning is automated
- only documented legal/provenance/history exceptions remain
- charcoal + violet design tokens drive the active presentation
- BabuşTV logo/calico assets replace inherited TV/play branding
- boot/shell/Live TV/settings surfaces present BabuşTV identity
- primary consumer copy is Turkish-first
- playback/provider/recovery behavior remains GREEN
- remote focus remains clear and deterministic
- storage/credential continuity is preserved, or any deviation from the target Tizen identity has explicit product approval based on evidence
- production build and Tizen packaging pass
- emulator smoke passes for supported scenarios

## 19. Non-regression requirements

B0 must preserve:

1. provider core behavior
2. credential-security boundaries
3. playback engine boundaries
4. Shaka-first policy and AVPlay fallback contracts
5. M3 last-intent-wins semantics
6. stale-intent protection
7. single-session bounded recovery
8. highlight/playback separation
9. Back layer ownership
10. Tizen 5.0+ compatibility target
11. secret/URL redaction requirements
12. cache-first startup behavior

A branding change is not justification for weakening any of these contracts.

## 20. Upstream integration rule after B0

Future upstream pulls must be treated as technical-source imports, not product-identity imports.

Any upstream change that reintroduces inherited naming, assets, CSS, copy, package identity, or documentation branding must be adapted to BabuşTV before merge.

The legacy-brand gate is part of this defense.

Upstream product UI should not be merged wholesale after B0 unless explicitly reviewed as a BabuşTV presentation change.

## 21. Execution gates

- implementation work starts only after this design is reviewed and approved
- an implementation plan is written before B0 production branches begin
- each production slice starts from fresh GREEN `main` unless the plan explicitly defines a stacked dependency
- TDD is required for production changes
- exact-head CI is required before merge
- explicit merge approval remains required
- post-merge `main` must be GREEN before dependent work begins
- parallel work is allowed only where ownership is genuinely independent

## 22. Success definition

A user installing and opening BabuşTV after B0 should have no reasonable visual or product-level indication that the application originated from ENTV.

A developer inspecting active package names, build artifacts, application identity, and presentation code should likewise see BabuşTV as the canonical product.

Only technical lineage, legal attribution, and intentionally preserved historical documentation may reveal the upstream origin.
