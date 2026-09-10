# BabuşTV V1 Wave 3B PAIR-C Base Retarget Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement the referenced PAIR-C plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retarget the untouched PAIR-C worker branch from the old Wave 1 base to the current GREEN Wave 3B base without changing the approved crypto scope or semantics.

**Architecture:** The canonical implementation behavior remains defined by `docs/superpowers/plans/2026-09-10-v1-wave1-pair-c-crypto.md`. This addendum changes only the exact base/evidence boundary because the branch contains no PAIR-C implementation commits and can be fast-forwarded safely.

**Tech Stack:** Git, TypeScript 5.9, Web Crypto, Node `node:test`/`tsx`.

**Spec:** `docs/superpowers/specs/2026-09-10-wave3b-home-m4-pairing-execution-design.md`

## Global Constraints

- ROLE: `PAIR-C`.
- Branch: `feature/pairing-crypto`.
- Old branch head: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- New exact implementation base: `b55a01642cd03a555712dd64026f3e22f1a81323`.
- Canonical behavior/tasks/interfaces remain those in `docs/superpowers/plans/2026-09-10-v1-wave1-pair-c-crypto.md`.
- Own only `player/src/pairing/crypto.ts` and `player/test-ts/pairing-crypto.test.ts`.
- No relay/session/provider/storage/UI/main.js/playback/package changes.
- Do not modify the historical Wave 1 plan to rewrite provenance.

---

### Task 1: Prove the branch is safe to fast-forward

- [ ] Verify `feature/pairing-crypto` is exactly `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1` before retargeting.
- [ ] Verify there are no branch-only commits or changed files relative to that old base.
- [ ] Move the branch ref forward to `b55a01642cd03a555712dd64026f3e22f1a81323` with a non-force fast-forward only.
- [ ] Re-read the current Web Crypto/platform contracts and confirm no merged change invalidates the old PAIR-C public API. If incompatibility is found, stop and report a Controller blocker rather than broadening scope.

Expected post-retarget state:

```text
feature/pairing-crypto == b55a01642cd03a555712dd64026f3e22f1a81323
working production diff == empty
```

---

### Task 2: Execute the canonical PAIR-C TDD plan on the new base

- [ ] Follow Tasks 1-2 of `2026-09-10-v1-wave1-pair-c-crypto.md` unchanged: versioned ephemeral P-256 ECDH + AES-256-GCM contract, non-extractable private keys, Base64URL envelope, authenticated round trip, tamper/wrong-key rejection, sanitized errors, no secret/log persistence.
- [ ] Use synthetic opaque bytes only.
- [ ] Preserve the exact owned file set.

The canonical RED remains module absence at the new base; GREEN remains the focused PAIR-C tests plus typecheck.

---

### Task 3: Close out against the new exact base

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

Expected changed files: exactly `player/src/pairing/crypto.ts` and `player/test-ts/pairing-crypto.test.ts`.

Open a Draft PR recording the new exact base/head, RED/GREEN evidence, crypto/tamper/no-secret assertions and canonical gates. Physical Samsung/Tizen Web Crypto support remains `NOT VERIFIED` without real runtime evidence. Do not mark Ready or merge.
