# BabuşTV V1 Wave 3B PAIR-S Base Retarget Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement the referenced PAIR-S plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retarget the untouched PAIR-S branch to the current GREEN Wave 3B base while preserving the approved five-minute, single-use, replay-safe in-memory session contract.

**Architecture:** `docs/superpowers/plans/2026-09-10-v1-wave1-pair-s-session.md` remains the canonical implementation plan. This addendum changes only the branch base and exact-head verification boundary; no PAIR-S implementation exists on the old branch.

**Tech Stack:** Git, TypeScript 5.9, Web Crypto random values, Node `node:test`/`tsx`.

**Spec:** `docs/superpowers/specs/2026-09-10-wave3b-home-m4-pairing-execution-design.md`

## Global Constraints

- ROLE: `PAIR-S`.
- Branch: `feature/pairing-session`.
- Old branch head: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- New exact implementation base: `b55a01642cd03a555712dd64026f3e22f1a81323`.
- Canonical tasks/interfaces: `docs/superpowers/plans/2026-09-10-v1-wave1-pair-s-session.md`.
- Own only `player/src/pairing/session.ts` and `player/test-ts/pairing-session.test.ts`.
- Default TTL remains exactly `5 * 60 * 1000` ms.
- Session values remain opaque; no import from PAIR-C/PAIR-R.
- No relay/crypto/provider/storage/UI/main.js/playback/package changes.

---

### Task 1: Safe base retarget

- [ ] Confirm the branch still points exactly to `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1` and has no unique implementation commits.
- [ ] Fast-forward, without force, to `b55a01642cd03a555712dd64026f3e22f1a81323`.
- [ ] Re-read current platform/randomness conventions; if merged code invalidates the old plan's Web Crypto random-ID assumptions, report a Controller blocker instead of adding dependencies or `Math.random()` fallback.

Expected post-retarget diff: empty.

---

### Task 2: Execute canonical PAIR-S behavior unchanged

- [ ] Follow the original PAIR-S tasks: secure 128-bit session IDs, injected clock/ID seams, positive finite TTL validation, exact expiry boundary, collision rejection, single-use consume, consumed tombstone until expiry, replay/expired/missing distinction and `purgeExpired()`.
- [ ] Keep values opaque and never log/serialize them.
- [ ] Use synthetic values only.

Focused RED/GREEN commands use the original plan, but all exact-base assertions now use `b55a01642cd03a555712dd64026f3e22f1a81323`.

---

### Task 3: New-base final verification and Draft PR

Run:

```bash
npm test
npm run typecheck
npm run brand:check
npm run build
npm run tizen:build
git diff --exit-code
git diff --name-only b55a01642cd03a555712dd64026f3e22f1a81323...HEAD
git diff --check b55a01642cd03a555712dd64026f3e22f1a81323...HEAD
```

Expected changed files: exactly `player/src/pairing/session.ts` and `player/test-ts/pairing-session.test.ts`.

Draft PR evidence must record exact base/head, five-minute TTL, expiry boundary, single-use/replay/collision/purge tests, secure randomness behavior and canonical gates. Physical Tizen runtime remains `NOT VERIFIED`. Do not mark Ready or merge.
