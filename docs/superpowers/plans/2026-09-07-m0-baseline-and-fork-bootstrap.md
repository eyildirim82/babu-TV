# BabuşTV M0 Baseline and Fork Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bootstrap `eyildirim82/babu-TV` from the exact EN TV Player v1.10.1 Git history, preserve the working Tizen/playback baseline, add deterministic characterization tests, commit the approved BabuşTV V1 design, and establish a repeatable verification gate before product refactors begin.

**Architecture:** M0 is intentionally conservative. It preserves the inherited `player/`, `tizen/`, and npm-workspace structure. Only documentation, characterization tests, repository rules, and CI are added; production playback behavior is not refactored.

**Tech Stack:** Git, Node.js ESM, npm workspaces, Vite 6, Shaka Player 5.2, Node built-in test runner, Samsung Tizen WGT tooling, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md`

## Global Constraints

- Upstream baseline is exactly `Nur-allhi/en-tvplayer@785bd4dfa13a09bfa947856d4ca43a97d982ecef` (`v1.10.1`).
- Preserve upstream Git history; the one-time empty-repository bootstrap is the only direct `main` mutation in M0.
- After bootstrap, all development happens on branches through PRs.
- Do not change product-visible playback, remote, playlist, or settings behavior in M0.
- No React and no TypeScript migration in M0.
- Never commit real provider credentials, URLs, playlist/EPG dumps, signing keys/certificates, tokens, or sensitive logs.
- Preserve MIT license/attribution.
- Characterization tests describe inherited behavior rather than redesigning it.
- Do not commit generated WGT/signing outputs.
- Never auto-merge upstream.

---

### Task 1: Hydrate Exact Upstream History

**Produces:** `main` at exact upstream SHA with history preserved; working branch `docs/m0-baseline-bootstrap`.

- [x] Verify target repo was empty.
- [x] Import exact EN TV Player history.
- [x] Verify `main == 785bd4dfa13a09bfa947856d4ca43a97d982ecef` and parent history is reachable.
- [x] Create `docs/m0-baseline-bootstrap` from the exact baseline.

Implementation note: the connected GitHub API did not expose a repository-import operation. A one-shot GitHub Actions bootstrap mirrored upstream and force-with-lease replaced the temporary empty-repo bootstrap commit with the exact upstream baseline. The workflow then disappeared with that temporary history. Fresh verification confirmed `main` points to the exact upstream SHA and its parents are present.

---

### Task 2: Record Product Design and Upstream Provenance

**Files:**
- `docs/superpowers/specs/2026-09-07-babustv-v1-product-and-architecture-design.md`
- `docs/UPSTREAM_BASELINE.md`
- `docs/decisions/0001-controlled-upstream-divergence.md`

- [x] Add the approved BabuşTV V1 product/architecture source of truth.
- [x] Record exact upstream repo, SHA, release, license, inherited structure, and preserved behavior.
- [x] Record controlled-divergence ADR.

---

### Task 3: Characterize Inherited M3U and Stream-URL Behavior

**Files:**
- Modify `package.json` to add `npm test`.
- Create `player/test/utils.test.js`.

- [x] Test pipe-suffix headers normalize to lowercase request headers.
- [x] Test `edge-*` pipe values remain URL query parameters.
- [x] Test M3U group, channel number, ClearKey, user agent, custom headers, and proxy metadata.
- [x] Test sequential fallback channel numbering.

Production parser code is intentionally unchanged.

---

### Task 4: Characterize Inherited Remote Mapping

**File:** `player/test/remote.test.js`

- [x] Test Up/Down/Left/Right/Select/Back.
- [x] Test optional Channel Up/Down and color-key mappings.
- [x] Test numeric buffering emits the combined channel number after the inherited 500 ms delay.

Production remote code is intentionally unchanged.

---

### Task 5: Lock AVPlay Safety Guard

**File:** `player/test/avplay.test.js`

- [x] Verify AVPlay reports unavailable outside Tizen.
- [x] Verify `stop()` cannot call native `stop()`/`close()` before a native session has been opened.

Production AVPlay code is intentionally unchanged.

---

### Task 6: Establish BabuşTV Development and Repository Rules

**Files:**
- `AGENTS.md`
- `docs/REPO_RULES.md`

- [x] Replace upstream project-specific agent/release ownership instructions with BabuşTV rules.
- [x] Require fresh main/PR/CI/upstream checks before tasks.
- [x] Require root-cause -> RED -> minimum fix -> GREEN for bugs.
- [x] Ban direct `main` development, secret/provider-data commits, blind upstream merges, and big-bang rewrites.
- [x] Define branch/PR/commit/test discipline.

---

### Task 7: Add Required Verification Workflow

**File:** `.github/workflows/verify.yml`

Verification on PRs and `main`:

```bash
npm ci
npm test
npm run build
git diff --exit-code
```

- [x] Use Node 22.
- [x] Keep workflow permissions read-only.
- [x] Make tests and production build required technical evidence for M0.

---

### Task 8: Probe Inherited WGT Packaging Without Refactoring It

**File:** `docs/PACKAGING_BASELINE.md`

- [x] Run a one-off GitHub Actions packaging probe with `npm ci`, `npm run build`, and `npm run tizen`.
- [x] Confirm OpenSSL-based developer signing can complete on Ubuntu CI.
- [x] Confirm missing Tizen SDB is skipped in packaging-only mode.
- [x] Confirm generated author key/cert are ignored.
- [x] Record existing Vite warnings and the inherited Linux `tizen/nul` side effect.
- [x] Remove the temporary packaging-probe workflow after evidence is captured.

Do not fix the `tizen/nul` side effect in M0; it is inherited behavior and should be addressed in a separately scoped fix with tests.

---

### Task 9: Open Draft PR and Verify Exact Head

**Files:** this plan plus all M0 files above.

- [x] Save the execution plan in the repository.
- [ ] Open a Draft PR from `docs/m0-baseline-bootstrap` to `main`.
- [ ] Verify the PR is based on current `main` and review its exact diff.
- [ ] Wait for exact-head `verify` workflow.
- [ ] If verification fails, inspect the root cause before changing code.
- [ ] Require `npm test` and `npm run build` GREEN on the exact PR head.
- [ ] Leave the PR unmerged until explicit user approval.

## Definition of Done for M0

M0 is complete only when the exact upstream history is preserved, approved design/provenance/rules are repository-local, characterization tests pass, production build passes, inherited WGT packaging baseline is documented, the Draft PR diff has been reviewed, and the exact PR head is GREEN. No M1 architecture or product feature work starts before this gate.
