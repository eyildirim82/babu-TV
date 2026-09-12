# BabuşTV M7 Hardening Execution Board

**Date:** 2026-09-12  
**Owner:** REVIEW / Integration Controller  
**Status:** M7-F0 FROZEN — SIX HARDENING WORKERS PLAN-BACKED / READY  
**Frozen production base:** `0cdc1ed240707b389d202d48efeaaf5822fe2316`  
**Post-merge verify:** `34685628558` SUCCESS  
**Design:** `docs/superpowers/specs/2026-09-12-m7-hardening-design.md`

## Current truth

- Wave 3C is CLOSED.
- `PAIR-I-WIRE` merged through PR #87.
- production `main` is exactly `0cdc1ed240707b389d202d48efeaaf5822fe2316`.
- run `34685628558` is SUCCESS for that exact main SHA.
- repository-complete RC implementation work is now M7 Hardening.
- no physical Samsung/Tizen device is available.
- physical Tizen acceptance remains `PENDING` / `DEFERRED` where required.
- deterministic browser/build/test evidence must never be promoted to physical-device PASS.

This board is the current M7 controller truth. Older RC/Wave 1 current-action wording in legacy boards is historical and superseded, not deleted.

## Worker board

| ROLE | Branch | Status | Plan | Frozen production base |
| --- | --- | --- | --- | --- |
| `MIG` | `hardening/storage-migrations` | `READY / PLAN-BACKED` | `docs/superpowers/plans/2026-09-12-m7-mig.md` | `0cdc1ed240707b389d202d48efeaaf5822fe2316` |
| `FAIL` | `hardening/provider-failures` | `READY / PLAN-BACKED` | `docs/superpowers/plans/2026-09-12-m7-fail.md` | `0cdc1ed240707b389d202d48efeaaf5822fe2316` |
| `PERF` | `hardening/catalog-epg-performance` | `READY / PLAN-BACKED` | `docs/superpowers/plans/2026-09-12-m7-perf.md` | `0cdc1ed240707b389d202d48efeaaf5822fe2316` |
| `NAV` | `hardening/focus-navigation` | `READY / PLAN-BACKED` | `docs/superpowers/plans/2026-09-12-m7-nav.md` | `0cdc1ed240707b389d202d48efeaaf5822fe2316` |
| `PLAY` | `hardening/live-tv-regression` | `READY / PLAN-BACKED` | `docs/superpowers/plans/2026-09-12-m7-play.md` | `0cdc1ed240707b389d202d48efeaaf5822fe2316` |
| `SEC` | `hardening/security-privacy-audit` | `READY / PLAN-BACKED` | `docs/superpowers/plans/2026-09-12-m7-sec.md` | `0cdc1ed240707b389d202d48efeaaf5822fe2316` |

All six may execute concurrently. The docs branch is read-only input and must never be cherry-picked into production branches.

## Common hardening rule

Every repair must use:

```text
reproduce
→ RED
→ root cause
→ minimum fix
→ GREEN
```

A required scenario that is already GREEN is evidence. Workers must not manufacture production churn in order to create a RED.

M7 is not a general refactor wave.

## Frozen forbidden hot zones

All six workers are forbidden from editing:

```text
player/src/main.js
player/src/app/app-composition.ts
player/src/app/browser-app-dependencies.ts
player/src/live-tv/create-live-tv-runtime.ts
player/src/live-tv/live-tv-controller.ts
```

Arbitrary shared-contract widening is also forbidden.

If a RED requires one of these files, the worker stops and reports:

```text
INTEGRATION FIX REQUIRED
```

with the exact failing test, root cause and minimum required hot-zone path. Controller may create `ROLE=M7-I` later.

## Ownership summary

| ROLE | Primary production ownership | M7-only test/tool ownership |
| --- | --- | --- |
| PERF | EPG normalization/query, Search core/view-model, Home projection, proven catalog read/query performance | `player/test-ts/m7-perf-hardening.test.ts`, `player/test-ts/fixtures/m7-large-data.ts` |
| FAIL | provider HTTP/adapters/sync/EPG/onboarding/re-entry failure boundaries | `player/test-ts/m7-provider-failures.test.ts` |
| MIG | `player/src/storage/*` plus structured repository migration/corruption/preservation semantics | `player/test-ts/m7-storage-migrations.test.ts` |
| NAV | focus reducer and Home/First Run/Provider Management/Live TV presentation navigation | `player/test-ts/m7-navigation-regression.test.ts` |
| PLAY | `player/src/playback/*`, channel intent coordinator, provider stream resolver, watch playback-session observer | `player/test-ts/m7-playback-regression.test.ts` |
| SEC | audit tooling/tests; `logging/sanitize.ts` and proven credential/provider/pairing secret boundaries only | `tools/check-m7-security-privacy.mjs`, `player/test-ts/m7-security-privacy-audit.test.ts` |

Exact conditional production paths are authoritative in each worker plan.

## Conflict / serialization matrix

| Pair | Default | Potential collision | Controller rule |
| --- | --- | --- | --- |
| MIG ↔ FAIL | parallel | none expected | run concurrently |
| MIG ↔ PERF | parallel | `structured-epg-program-repository.ts`, `structured-catalog-repository.ts` | one writer per exact path; MIG owns integrity/migration, PERF owns proven read/query complexity; controller serializes/retargets if both require same path |
| MIG ↔ NAV | parallel | none expected | run concurrently |
| MIG ↔ PLAY | parallel | none expected | run concurrently |
| MIG ↔ SEC | parallel | storage is audit-read-only to SEC | SEC may not redesign structured storage; security defect in MIG-owned file requires controller routing |
| FAIL ↔ PERF | parallel | no default overlap | run concurrently |
| FAIL ↔ NAV | parallel | none expected | run concurrently |
| FAIL ↔ PLAY | parallel | provider adapter is consumed by PLAY resolver | no shared writes by default; contract widening forbidden |
| FAIL ↔ SEC | parallel | provider file with secret-boundary defect | controller file lock; SEC owns secret/privacy correction, FAIL owns ordinary failure semantics |
| PERF ↔ NAV | parallel | Home domain vs Home view | separate files/concerns |
| PERF ↔ PLAY | parallel | none expected | run concurrently |
| PERF ↔ SEC | parallel | audit only | run concurrently |
| NAV ↔ PLAY | parallel | presentation vs playback intent | no shared writes; highlight/navigation must remain non-playback |
| NAV ↔ SEC | parallel | audit only | run concurrently |
| PLAY ↔ SEC | parallel | pairing/credential audit consumes playback only read-only | run concurrently |

A collision is not permission for either worker to widen scope. Controller decides merge/retarget order.

## Preferred merge order

Merge preference after controller audit is:

```text
MIG
→ FAIL
→ PERF
→ NAV
→ PLAY
→ SEC-FINAL
```

This is not worker execution order. All six production lanes may work concurrently from the frozen base.

After every accepted merge that affects a dependency edge, require a successful verification on the resulting exact `main` SHA before advancing dependent integration/retarget work.

## Worker verification contract

Every worker runs its plan-specific focused tests, then:

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --check 0cdc1ed240707b389d202d48efeaaf5822fe2316...HEAD
git diff --name-only 0cdc1ed240707b389d202d48efeaaf5822fe2316...HEAD
```

Every worker opens a Draft PR only. No worker self-merges or marks its PR Ready.

`npm run tizen:package` belongs to the later package/release gate and may be environment-dependent; unavailable packaging or physical execution is not PASS.

## PERF special rule

PERF measures frozen-base behavior first. It must prefer deterministic algorithmic/work-count assertions over arbitrary elapsed-time budgets. Wall-clock data may be diagnostic only unless an existing stable benchmark contract already exists.

Only proven pathological work may be optimized.

## SEC two-phase rule

`SEC-EARLY` runs on the frozen base and may produce audit tests/tooling and proven bounded fixes.

`SEC-FINAL` is mandatory after all accepted M7 production merges and any required M7-I fixes are integrated. Final audit must run against the exact integrated `main` head after exact-main verification is GREEN.

An early SEC worker success is not final security acceptance.

## M7 completion gate

M7 closes only when:

```text
PERF GREEN
FAIL GREEN
MIG GREEN
NAV GREEN
PLAY GREEN
required M7-I fixes GREEN, if any
integrated main exact-head verify GREEN
SEC-FINAL GREEN
```

Then the next release-candidate sequence is:

```text
RC-BROWSER + RC-PACKAGE
→ version decision
→ repository-complete 1.0.0-rc.1 candidate
```

## Physical-Tizen debt

Physical Samsung/Tizen acceptance is not available in M7-F0. Hardware-dependent rows remain explicitly `PENDING` / `DEFERRED`. Deterministic tests, browser smoke, build/stage/package construction, install metadata or CI success must not be relabeled as physical runtime PASS.

Repository-complete RC readiness and physical release acceptance remain separate gates.

## Short worker prompts

```text
Repo eyildirim82/babu-TV. ROLE=PERF. Read docs/verification/m7-hardening-execution.md and your bounded M7 plan. Start from exact frozen base only.
```

```text
Repo eyildirim82/babu-TV. ROLE=FAIL. Read docs/verification/m7-hardening-execution.md and your bounded M7 plan. Start from exact frozen base only.
```

```text
Repo eyildirim82/babu-TV. ROLE=MIG. Read docs/verification/m7-hardening-execution.md and your bounded M7 plan. Start from exact frozen base only.
```

```text
Repo eyildirim82/babu-TV. ROLE=NAV. Read docs/verification/m7-hardening-execution.md and your bounded M7 plan. Start from exact frozen base only.
```

```text
Repo eyildirim82/babu-TV. ROLE=PLAY. Read docs/verification/m7-hardening-execution.md and your bounded M7 plan. Start from exact frozen base only.
```

```text
Repo eyildirim82/babu-TV. ROLE=SEC. Read docs/verification/m7-hardening-execution.md and your bounded M7 plan. Start from exact frozen base only.
```

## Controller state

`M7-F0` has no unresolved architectural blocker. Six worker plans are frozen from the exact production tree. The only declared conflicts are controller-serialized exact-path collisions described above. Worker execution may begin once each worker independently verifies its branch base equals `0cdc1ed240707b389d202d48efeaaf5822fe2316`.