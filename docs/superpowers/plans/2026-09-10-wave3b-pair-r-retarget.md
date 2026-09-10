# BabuşTV V1 Wave 3B PAIR-R Base Retarget Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement the referenced PAIR-R plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retarget the untouched PAIR-R relay-contract branch to the current GREEN Wave 3B base without changing the approved ciphertext-only HTTPS relay protocol or privacy boundary.

**Architecture:** `docs/superpowers/plans/2026-09-10-v1-wave1-pair-r-relay-contract.md` remains the canonical implementation plan. This addendum changes only branch base/evidence because the old branch contains no relay implementation commits.

**Tech Stack:** Git, TypeScript 5.9, injected HTTP transport, Node `node:test`/`tsx`; no new network/crypto dependency.

**Spec:** `docs/superpowers/specs/2026-09-10-wave3b-home-m4-pairing-execution-design.md`

## Global Constraints

- ROLE: `PAIR-R`.
- Branch: `feature/pairing-relay-contract`.
- Old branch head: `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1`.
- New exact implementation base: `b55a01642cd03a555712dd64026f3e22f1a81323`.
- Canonical tasks/interfaces: `docs/superpowers/plans/2026-09-10-v1-wave1-pair-r-relay-contract.md`.
- Own only `player/src/pairing/relay-contracts.ts`, `player/src/pairing/relay-client.ts`, `player/test-ts/pairing-relay-client.test.ts`.
- No import from PAIR-C/PAIR-S; session ID and ciphertext stay opaque strings.
- HTTPS only; no URL user-info/query secrets; errors remain fixed/sanitized.
- No real relay/provider endpoint, provider credential, UI/QR, storage, main.js, playback or package changes.

---

### Task 1: Safe base retarget

- [ ] Confirm branch head is exactly `aac531b15bad85f6e7ae42c6ff1a6b71eed289d1` with no unique implementation commits.
- [ ] Fast-forward without force to `b55a01642cd03a555712dd64026f3e22f1a81323`.
- [ ] Re-read current network/error conventions; if merged contracts conflict with the frozen relay request shapes, report a Controller blocker rather than silently expanding the protocol.

Expected post-retarget production diff: empty.

---

### Task 2: Execute canonical PAIR-R behavior unchanged

- [ ] Follow the original contract/client plan: exact create/put/poll shapes, injected transport, HTTPS base normalization, URL-encoded session path segments, finite positive timeout, ciphertext-only body, poll response validation, fixed `NETWORK`/`MALFORMED`/`UNAVAILABLE` errors and privacy surface tests.
- [ ] Use only `https://relay.example.invalid` synthetic test endpoint.
- [ ] Preserve exact owned files and no logging of endpoint/session/ciphertext/error details.

All exact-base diff commands in the original closeout are replaced with the new Wave 3B base.

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

Expected changed files are exactly the two relay production files and focused relay test file.

Draft PR evidence must record exact base/head, contract RED/GREEN, request-shape/privacy audit, sanitized transport/malformed response behavior and canonical gates. Relay hosting/rate limiting and physical Tizen runtime are not claimed by this lane. Do not mark Ready or merge.
